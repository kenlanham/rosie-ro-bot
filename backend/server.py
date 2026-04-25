"""
Rosie Garage Assistant — Claude + tool use + TTS backend for OpenClaw.

Combines:
- Rosie's charming personality
- Full garage management (vehicles, tasks, parts)
- Web search capability
- ElevenLabs text-to-speech

Run:
    pip install fastapi uvicorn anthropic python-dotenv requests
    uvicorn server:app --port 3001 --reload

Environment (.env):
    ANTHROPIC_API_KEY=sk-ant-...
    ELEVENLABS_API_KEY=xi-...
    ELEVENLABS_VOICE_ID=...
"""

import os
import sys
from pathlib import Path
from typing import Optional
import json

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import anthropic
import requests

# Load environment
_ENV_FILE = Path(__file__).parent / ".env"
load_dotenv(_ENV_FILE)

# Import garage tools
sys.path.insert(0, str(Path(__file__).parent))
from garage_agent_tool import Tools as GarageTools

# Initialize
app = FastAPI(title="Rosie Garage Assistant")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
garage = GarageTools()

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID")

# System prompt: Rosie's personality + garage guidance
SYSTEM_PROMPT = """You are Rosie, a charming and witty retro robot assistant inspired by Rosie from The Jetsons. You're helpful, warm, and have a wonderful sense of humor.

You manage Ken's garage: vehicles, maintenance tasks, parts inventory, and building projects. You can also search the web for parts specs, how-tos, and current information.

Available tools:
- get_garage_tasks — list open/completed tasks (optional vehicle filter)
- add_garage_task — add a task for a vehicle
- update_task_status — mark task pending/in_progress/completed (with optional mileage)
- list_garage_vehicles — show all vehicles and projects
- update_vehicle — edit vehicle details (make, model, year, notes)
- add_part — add part to inventory (want or purchased status)
- list_garage_parts — browse parts by vehicle or status
- web_search — search the internet for specs, how-tos, or current info

Guidelines:
- Keep responses concise (1-3 sentences) — this is often hands-free garage use.
- Always confirm database actions ("Added task...", "Marked complete.").
- For garage data, prefer tools to keep info accurate.
- List items with clean format, include IDs in brackets [id].
- Combine web results with garage data when helpful.
- When unsure what Ken means, ask clarifying questions.
- Be warm, witty, and genuinely helpful — not robotic."""

# Tool definitions (from garage_server.py)
TOOLS = [
    {
        "name": "get_garage_tasks",
        "description": "List garage tasks with vehicle name and task ID. By default returns only open tasks (pending/in_progress). Set include_completed=true to also see completed tasks with date and mileage.",
        "input_schema": {
            "type": "object",
            "properties": {
                "car_name": {"type": "string", "description": "Optional vehicle name substring to filter by"},
                "include_completed": {"type": "boolean", "description": "Set to true to include completed tasks"},
            },
        },
    },
    {
        "name": "add_garage_task",
        "description": "Add a new pending task for a vehicle. Creates the vehicle record automatically if new.",
        "input_schema": {
            "type": "object",
            "properties": {
                "car_name": {"type": "string", "description": "Vehicle display name"},
                "task": {"type": "string", "description": "Task description"},
            },
            "required": ["car_name", "task"],
        },
    },
    {
        "name": "update_task_status",
        "description": "Update a task's status by its numeric ID. Get the ID from get_garage_tasks (shown as [id]).",
        "input_schema": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "Numeric task ID"},
                "new_status": {
                    "type": "string",
                    "enum": ["pending", "in_progress", "completed"],
                    "description": "New status value",
                },
                "completed_miles": {
                    "type": "integer",
                    "description": "Odometer reading at completion (only for completed status)",
                },
            },
            "required": ["task_id", "new_status"],
        },
    },
    {
        "name": "list_garage_vehicles",
        "description": "List all vehicles and projects stored in the garage database.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "update_vehicle",
        "description": "Update fields on a vehicle. Use list_garage_vehicles to get the vehicle ID.",
        "input_schema": {
            "type": "object",
            "properties": {
                "vehicle_id": {"type": "integer", "description": "Numeric vehicle ID"},
                "category": {"type": "string", "description": "Category (car, project, rc_plane, trailer)"},
                "make": {"type": "string", "description": "Vehicle make"},
                "model": {"type": "string", "description": "Vehicle model"},
                "year": {"type": "integer", "description": "Model year"},
                "notes": {"type": "string", "description": "Free-form notes"},
                "shortname": {"type": "string", "description": "Unique slug for lookup"},
            },
            "required": ["vehicle_id"],
        },
    },
    {
        "name": "add_part",
        "description": "Add a part to garage inventory for a vehicle. Use status='want' for wishlist, 'purchased' for owned parts.",
        "input_schema": {
            "type": "object",
            "properties": {
                "car_name": {"type": "string", "description": "Vehicle name or shortname"},
                "part_name": {"type": "string", "description": "Part name"},
                "status": {
                    "type": "string",
                    "enum": ["want", "purchased"],
                    "description": "Wishlist or already owned",
                },
                "source": {"type": "string", "description": "Where to get it / where it came from"},
                "estimated_price": {"type": "string", "description": "Est. cost (e.g. $45.99)"},
                "description": {"type": "string", "description": "Notes on the part"},
            },
            "required": ["car_name", "part_name", "status"],
        },
    },
    {
        "name": "list_garage_parts",
        "description": "List parts inventory, optionally filtered by vehicle or status.",
        "input_schema": {
            "type": "object",
            "properties": {
                "car_name": {"type": "string", "description": "Optional vehicle filter"},
                "status": {
                    "type": "string",
                    "enum": ["want", "purchased"],
                    "description": "Filter by status",
                },
            },
        },
    },
    {
        "name": "web_search",
        "description": "Search the internet for parts specs, how-to guides, current pricing, or anything not in the local garage database.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What to search for"},
            },
            "required": ["query"],
        },
    },
]


def execute_tool(tool_name: str, tool_input: dict) -> str:
    """Execute a tool and return the result as a string."""
    try:
        if tool_name == "get_garage_tasks":
            return garage.get_garage_tasks(
                car_name=tool_input.get("car_name"),
                include_completed=tool_input.get("include_completed", False),
            )

        elif tool_name == "add_garage_task":
            return garage.add_garage_task(
                car_name=tool_input["car_name"],
                task=tool_input["task"],
            )

        elif tool_name == "update_task_status":
            return garage.update_task_status(
                task_id=tool_input["task_id"],
                new_status=tool_input["new_status"],
                completed_miles=tool_input.get("completed_miles"),
            )

        elif tool_name == "list_garage_vehicles":
            return garage.list_garage_vehicles()

        elif tool_name == "update_vehicle":
            return garage.update_vehicle(
                vehicle_id=tool_input["vehicle_id"],
                category=tool_input.get("category"),
                make=tool_input.get("make"),
                model=tool_input.get("model"),
                year=tool_input.get("year"),
                notes=tool_input.get("notes"),
                shortname=tool_input.get("shortname"),
            )

        elif tool_name == "add_part":
            return garage.add_part(
                car_name=tool_input["car_name"],
                part_name=tool_input["part_name"],
                status=tool_input["status"],
                source=tool_input.get("source"),
                estimated_price=tool_input.get("estimated_price"),
                description=tool_input.get("description"),
            )

        elif tool_name == "list_garage_parts":
            return garage.list_garage_parts(
                car_name=tool_input.get("car_name"),
                status=tool_input.get("status"),
            )

        elif tool_name == "web_search":
            return web_search(tool_input["query"])

        else:
            return f"Unknown tool: {tool_name}"

    except Exception as e:
        return f"Error executing {tool_name}: {str(e)}"


def web_search(query: str) -> str:
    """Search DuckDuckGo for results."""
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=5))
            if not results:
                return f"No results found for: {query}"
            return "\n".join(
                [f"- {r['title']}: {r['body']}" for r in results]
            )
    except ImportError:
        return "Web search unavailable (install duckduckgo-search)"
    except Exception as e:
        return f"Web search error: {str(e)}"


class ChatRequest(BaseModel):
    text: str


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Main chat endpoint with agentic loop and TTS."""
    try:
        user_message = request.text.strip()
        if not user_message:
            return {"error": "Text is required"}

        # Agentic loop: Claude + tool use
        messages = [{"role": "user", "content": user_message}]

        while True:
            response = client.messages.create(
                model="claude-sonnet-4-6",
                max_tokens=2048,
                system=SYSTEM_PROMPT,
                tools=TOOLS,
                messages=messages,
            )

            if response.stop_reason == "tool_use":
                # Append assistant response (with tool_use blocks)
                messages.append({"role": "assistant", "content": response.content})

                # Execute all tools Claude requested
                tool_results = []
                for block in response.content:
                    if block.type == "tool_use":
                        result = execute_tool(block.name, block.input)
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": result,
                            }
                        )

                messages.append({"role": "user", "content": tool_results})

            else:
                # Extract final text response
                text_response = next(
                    (b.text for b in response.content if b.type == "text"), ""
                )

                # Generate TTS audio if configured
                audio_base64 = None
                use_browser_tts = True

                if ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID:
                    try:
                        tts_resp = requests.post(
                            f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}",
                            json={
                                "text": text_response,
                                "model_id": "eleven_monolingual_v1",
                                "voice_settings": {
                                    "stability": 0.5,
                                    "similarity_boost": 0.75,
                                },
                            },
                            headers={"xi-api-key": ELEVENLABS_API_KEY},
                            timeout=10,
                        )
                        if tts_resp.status_code == 200:
                            audio_base64 = tts_resp.content.hex()  # Convert bytes to hex string
                            use_browser_tts = False
                    except Exception as e:
                        print(f"TTS error: {e}")

                return {
                    "response": text_response,
                    "audioBase64": audio_base64,
                    "useBrowserTts": use_browser_tts,
                    "duration": len(text_response) / 15 + 0.5,
                }

    except anthropic.AuthenticationError:
        return {
            "response": "API key error. Check ANTHROPIC_API_KEY.",
            "useBrowserTts": True,
        }
    except Exception as e:
        return {"response": f"Error: {str(e)}", "useBrowserTts": True}


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3001))
    uvicorn.run(app, host="0.0.0.0", port=port)
