# Rosie — Claude Code Context

## What This Project Is
Rosie is a custom AI voice assistant built for Ken (Westminster, CO). She has a retro robot personality, voice I/O, and lives inside openclaw.

## Architecture
- **Agent identity:** `SOUL.md`, `IDENTITY.md`, `AGENTS.md`, `USER.md` — Rosie's personality and memory system, read by openclaw on each session
- **Backend:** `backend/server.js` — Node.js/Express, port 3001
  - Claude API (`claude-opus-4-7` for chat, `claude-haiku-4-5-20251001` for briefings)
  - ElevenLabs TTS (`eleven_monolingual_v1`)
  - Weather via Open-Meteo (no key needed), hardcoded to Westminster CO
- **Frontend:** `frontend/` — React + Vite + Three.js, port 5173
  - `RobotScene.jsx` — 3D robot with mouth-sync, head movement, eye blinks
  - `VoiceInput.jsx` — Web Speech API for voice input
  - `AvatarDisplay.jsx` — 2D avatar fallback
- **Garage assistant:** `backend/garage_agent_tool.py` + `backend/garage.db` — SQLite-backed car/project tracker, Python FastAPI (`backend/server.py`)
- **MCP server:** `backend/garage-mcp.js` — exposes garage tools to openclaw

## Environment
- Runtime: WSL2 on Windows (Ubuntu)
- Installed: `openclaw@2026.4.23` at `/usr/bin/openclaw`
- Workspace path: `/home/lanhammer/.openclaw/workspace/` (openclaw reads here natively)
- Git remote: `https://github.com/kenlanham/rosie-ro-bot`

## Secrets (never commit)
- `backend/.env` — ANTHROPIC_API_KEY, ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, PORT
- `elevenlabs-api.env.txt` — raw ElevenLabs key backup

## Starting the App
```bash
# Backend
cd backend && npm run dev   # http://localhost:3001

# Frontend (separate terminal)
cd frontend && npm run dev  # http://localhost:5173
```

## Saving Work
```bash
git add -A
git commit -m "your message"
git push
```
