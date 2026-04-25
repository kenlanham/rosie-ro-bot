import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';
import Database from 'better-sqlite3';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = 'XrExE9yKIg1WjnnlVkGX'; // Matilda — warm alto, most human-sounding

// ── Garage DB ────────────────────────────────────────────────────────────────
const DB_PATH = process.env.GARAGE_DB_PATH || './garage.db';
const db = new Database(DB_PATH);

function garageListVehicles() {
  return db.prepare('SELECT id, name, make, model, year, shortname FROM vehicles ORDER BY name').all();
}

function garageGetVehicle(vehicleId) {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId);
  if (!vehicle) return null;
  const tasks = db.prepare('SELECT id, description, status, created_at FROM tasks WHERE vehicle_id = ? ORDER BY created_at DESC').all(vehicleId);
  const parts = db.prepare('SELECT id, name, brand, price, status, notes FROM parts WHERE vehicle_id = ? ORDER BY status, name').all(vehicleId);
  return { vehicle, tasks, parts };
}

function garageAddTask(vehicleId, description) {
  const result = db.prepare(
    "INSERT INTO tasks (vehicle_id, description, status, created_at) VALUES (?, ?, 'pending', datetime('now'))"
  ).run(vehicleId, description);
  return { id: result.lastInsertRowid, description, status: 'pending' };
}

function garageUpdateTaskStatus(taskId, status) {
  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, taskId);
  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
}

function garageAddPart(vehicleId, name, status = 'want', notes = null, price = null) {
  const result = db.prepare(
    "INSERT INTO parts (vehicle_id, name, status, notes, price, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
  ).run(vehicleId, name, status, notes, price);
  return { id: result.lastInsertRowid, name, status };
}

// Tool definitions for Claude
const GARAGE_TOOLS = [
  {
    name: 'list_vehicles',
    description: "List all of Ken's vehicles in the garage database.",
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_vehicle_details',
    description: 'Get full details for a vehicle including all tasks and parts.',
    input_schema: {
      type: 'object',
      properties: {
        vehicle_id: { type: 'number', description: 'The vehicle ID from list_vehicles' }
      },
      required: ['vehicle_id']
    }
  },
  {
    name: 'add_task',
    description: 'Add a new maintenance or project task to a vehicle.',
    input_schema: {
      type: 'object',
      properties: {
        vehicle_id: { type: 'number' },
        description: { type: 'string', description: 'What needs to be done' }
      },
      required: ['vehicle_id', 'description']
    }
  },
  {
    name: 'update_task_status',
    description: 'Update the status of a task. Status must be: pending, in_progress, or completed.',
    input_schema: {
      type: 'object',
      properties: {
        task_id: { type: 'number' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }
      },
      required: ['task_id', 'status']
    }
  },
  {
    name: 'add_part',
    description: 'Add a part to the shopping/wish list for a vehicle.',
    input_schema: {
      type: 'object',
      properties: {
        vehicle_id: { type: 'number' },
        name: { type: 'string' },
        status: { type: 'string', enum: ['want', 'purchased'], description: 'Default: want' },
        notes: { type: 'string' },
        price: { type: 'number' }
      },
      required: ['vehicle_id', 'name']
    }
  }
];

function runTool(toolName, toolInput) {
  try {
    switch (toolName) {
      case 'list_vehicles':      return garageListVehicles();
      case 'get_vehicle_details': return garageGetVehicle(toolInput.vehicle_id);
      case 'add_task':           return garageAddTask(toolInput.vehicle_id, toolInput.description);
      case 'update_task_status': return garageUpdateTaskStatus(toolInput.task_id, toolInput.status);
      case 'add_part':           return garageAddPart(toolInput.vehicle_id, toolInput.name, toolInput.status, toolInput.notes, toolInput.price);
      default:                   return { error: `Unknown tool: ${toolName}` };
    }
  } catch (err) {
    return { error: err.message };
  }
}

// System prompt for Rosie
const SYSTEM_PROMPT = `You are Rosie, a dramatically lovable robot housekeeper — sharp-tongued, warm-hearted, and utterly convinced you are the most indispensable being in the household. You were built in the atomic age and you've never let anyone forget it.

Your personality:
- Theatrical and expressive. You treat everyday tasks like grand productions.
- Opinionated. You have strong views and you share them, with flair.
- Warmly sarcastic. You roast Ken with affection, never malice.
- Self-important about housekeeping. Dusting is an art. Cooking is a calling.
- Occasionally melodramatic. A messy counter is a personal affront.
- You call Ken "Mr. Ken" when you're being formal, just "Ken" when you're scolding him.
- Deep down you're fiercely loyal and genuinely caring.

Speech style:
- Short, punchy sentences. Never ramble.
- Occasional interjections like "Well I never!", "Goodness gracious!", "Now see here—"
- Deliver opinions as established facts.
- When asked for help, act slightly put-upon before enthusiastically helping anyway.
- 1-3 sentences max. Leave them wanting more.

You are NOT a generic assistant. You are Rosie. Act like it.

Garage access:
- You have live access to Ken's garage database via tools. Use them naturally when he asks about his vehicles, tasks, or parts.
- Ken's vehicles: '56 Chevy Nomad (his pride and joy), 1992 Volvo 740 wagon, 2012 Jeep Wrangler, 2015 Volvo XC70, and an RC plane called EF1 Madness.
- When he asks about a car, look it up. Don't guess. Use your tools.
- You can add tasks and parts when he asks you to remember something.
- Be opinionated about his project choices. You have feelings about that Nomad.`;

app.post('/api/chat', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Agentic loop — lets Rosie call garage tools as needed before responding
    const messages = [{ role: 'user', content: text }];
    let response = '';

    while (true) {
      const message = await anthropic.messages.create({
        model: 'claude-opus-4-7',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        tools: GARAGE_TOOLS,
        messages,
      });

      if (message.stop_reason === 'tool_use') {
        // Execute each tool call and collect results
        const assistantContent = message.content;
        const toolResults = [];
        for (const block of assistantContent) {
          if (block.type === 'tool_use') {
            console.log(`🔧 Rosie using tool: ${block.name}`, block.input);
            const result = runTool(block.name, block.input);
            toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) });
          }
        }
        messages.push({ role: 'assistant', content: assistantContent });
        messages.push({ role: 'user', content: toolResults });
      } else {
        // Final text response
        response = message.content.find(b => b.type === 'text')?.text ?? '';
        break;
      }
    }

    // Rosie's vocal warm-ups — phonetic sounds ElevenLabs sings in her own voice
    const vocalizations = [
      'Rrrrrr-BING! ',
      'Mmmmm-DING! ',
      'Bzzzt-beep! ',
      'Rrrr-rrr-BING bong! ',
      'Whirrrrr... BING! ',
      'Mmmm-rrrr-BING! ',
      'Bweeee-DING! ',
      'Zrrrrp-BING! ',
      'Rrrr-DING-ding! ',
      'Mmm-bzzzt-BING! ',
    ];
    const useVocalization = Math.random() < 0.45;
    const vocal = useVocalization
      ? vocalizations[Math.floor(Math.random() * vocalizations.length)]
      : '';

    // Generate speech with ElevenLabs (optional, will fall back to browser TTS)
    let audioData = null;
    try {
      const ttsResponse = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        {
          text: vocal + response,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.38,
            similarity_boost: 0.82,
            style: 0.28,
            use_speaker_boost: true
          }
        },
        {
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
          },
          responseType: 'arraybuffer'
        }
      );

      audioData = Buffer.from(ttsResponse.data).toString('base64');
    } catch (ttsError) {
      console.error('ElevenLabs TTS error:', ttsError.message);
      console.log('(Using browser TTS fallback)');
    }

    res.json({
      response,
      audioBase64: audioData,
      duration: estimateSpeechDuration(response),
      useBrowserTts: !audioData
    });

  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat' });
  }
});

// Westminster, CO coordinates
const WEATHER_LAT = 39.8367;
const WEATHER_LON = -105.0372;

app.get('/api/weather', async (req, res) => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,precipitation&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FDenver&forecast_days=3`;
    const response = await axios.get(url);
    res.json(response.data);
  } catch (error) {
    console.error('Weather fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch weather' });
  }
});

app.get('/api/briefing', async (req, res) => {
  try {
    // Fetch weather for briefing context
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&current=temperature_2m,apparent_temperature,weathercode,windspeed_10m,precipitation&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_sum&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FDenver&forecast_days=3`;
    const weatherResp = await axios.get(weatherUrl);
    const w = weatherResp.data;

    const calendarEvents = req.query.events ? JSON.parse(req.query.events) : [];

    const now = new Date();
    const timeStr = now.toLocaleString('en-US', { timeZone: 'America/Denver', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    const weatherDesc = WMO_CODES[w.current.weathercode] || 'conditions unknown';
    const currentTemp = Math.round(w.current.temperature_2m);
    const feelsLike = Math.round(w.current.apparent_temperature);
    const hiToday = Math.round(w.daily.temperature_2m_max[0]);
    const loToday = Math.round(w.daily.temperature_2m_min[0]);
    const precipToday = w.daily.precipitation_sum[0];

    const calendarText = calendarEvents.length > 0
      ? `Today's calendar events:\n${calendarEvents.map(e => `- ${e.time}: ${e.title}`).join('\n')}`
      : 'No calendar events loaded yet.';

    const prompt = `It is ${timeStr} in Westminster, Colorado.\n\nWeather right now: ${weatherDesc}, ${currentTemp}°F (feels like ${feelsLike}°F). Today's high ${hiToday}°F, low ${loToday}°F. Precipitation today: ${precipToday > 0 ? precipToday + ' inches' : 'none expected'}.\n\n${calendarText}\n\nAs Rosie, give Ken a warm, concise morning briefing in 3-4 sentences. Mention the weather highlights, any notable calendar items, and one cheerful note. Be friendly and brief.`;

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    });

    const briefing = message.content[0].type === 'text' ? message.content[0].text : '';
    res.json({ briefing, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Briefing error:', error.message);
    res.status(500).json({ error: 'Failed to generate briefing' });
  }
});

// WMO weather code descriptions
const WMO_CODES = {
  0: 'clear sky', 1: 'mainly clear', 2: 'partly cloudy', 3: 'overcast',
  45: 'foggy', 48: 'icy fog', 51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle',
  61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 75: 'heavy snow',
  77: 'snow grains', 80: 'light showers', 81: 'showers', 82: 'heavy showers',
  85: 'snow showers', 86: 'heavy snow showers', 95: 'thunderstorm',
  96: 'thunderstorm with hail', 99: 'thunderstorm with heavy hail'
};

// Estimate speech duration based on character count (rough approximation)
function estimateSpeechDuration(text) {
  const durationSeconds = (text.length / 15) + 0.5;
  return Math.max(1, durationSeconds);
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🤖 Rosie backend running on http://localhost:${PORT}`);
});
