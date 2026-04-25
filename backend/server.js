import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

// System prompt for Rosie
const SYSTEM_PROMPT = `You are Rosie, a charming and witty retro robot assistant inspired by Rosie from The Jetsons. You're helpful, warm, and have a wonderful sense of humor. Keep responses concise (1-3 sentences), conversational, and engaging. You have a delightful, sophisticated personality with a gentle and caring tone. Respond naturally to whatever Ken asks, whether it's technical help, casual chat, or creative ideas. You speak with warmth and charm.`;

app.post('/api/chat', async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Get response from Claude
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: text }
      ]
    });

    const response = message.content[0].type === 'text' ? message.content[0].text : '';

    // Generate speech with ElevenLabs (optional, will fall back to browser TTS)
    let audioData = null;
    try {
      const ttsResponse = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
        {
          text: response,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
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
