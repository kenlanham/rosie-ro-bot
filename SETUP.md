# Rosie Voice Assistant - Setup Guide

## Quick Start

### 1. Install Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

### 2. Configure API Keys

Edit `backend/.env`:
```
ELEVENLABS_API_KEY=sk_5612cbf488c28d7e90c4d7b1c0283dd7d2c14759700db0e5
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx  # <- Your Claude API key here
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
PORT=3001
```

Get your Claude API key: https://console.anthropic.com/account/keys

### 3. Start the Backend

```bash
cd backend
npm run dev
```

You should see:
```
🤖 Rosie backend running on http://localhost:3001
```

### 4. Start the Frontend (new terminal)

```bash
cd frontend
npm run dev
```

Your browser should open at `http://localhost:5173`

## Usage

1. Click **"Talk to Rosie"** button
2. Speak clearly into your microphone
3. Watch Rosie respond with voice + animation
4. She'll process your request and chat back

## Troubleshooting

**"Speech Recognition not supported"**
- Make sure you're using Chrome, Edge, or another Chromium browser
- Safari and Firefox may not support Web Speech API

**No audio output**
- Check that ElevenLabs API key is correct
- Check browser console for errors
- Make sure backend is running on port 3001

**Robot not animating**
- Make sure Three.js loaded correctly
- Check browser console for WebGL errors
- Try a different browser if WebGL is disabled

**"Can't connect to localhost:3001"**
- Make sure backend is running
- Check that port 3001 is available
- Try restarting the backend server

## Features

✅ Voice input (Web Speech API)
✅ Real-time text-to-speech (ElevenLabs)
✅ 3D robot animation with mouth-sync
✅ Head movements and eye blinks
✅ Idle animations (breathing, subtle movement)
✅ Claude integration for smart responses
✅ Rosie personality system prompt

## Architecture

- **Backend**: Node.js + Express
- **Frontend**: React + Three.js
- **Voice In**: Web Speech API
- **Voice Out**: ElevenLabs TTS
- **LLM**: Anthropic Claude
- **Build Tool**: Vite

## Next Steps

- Customize Rosie's responses by editing SYSTEM_PROMPT in `backend/server.js`
- Adjust animation timing in `RobotScene.jsx`
- Add more complex gestures or facial expressions
- Integrate with Discord/WhatsApp for multi-platform access
