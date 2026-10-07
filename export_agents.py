"""
Exports the full `agents` table (ai_village.db, populated by ingest.py) to
frontend/public/data/agents.json -- this table has participation/goal/status
data that isn't attached to any transcript and was previously invisible in
the viewer (only agentId/agentName baked into Claude Code transcripts showed
up at all).

Run: python3 export_agents.py
"""
import json
import sqlite3
from pathlib import Path

DB = "ai_village.db"
OUT_DIR = Path("frontend/public/data")
MANIFEST = OUT_DIR / "manifest.json"

COLUMNS = [
    "id", "name", "emoji", "status_message", "goal", "model_string",
    "is_pending", "is_updating_memory", "is_participating", "money",
    "paused_until", "current_room_id", "village_id",
    "input_tokens_used", "output_tokens_used",
    "created_at", "updated_at",
]

# snake_case -> camelCase, matching the rest of the exported JSON
FIELD_MAP = {
    "id": "id",
    "name": "name",
    "emoji": "emoji",
    "status_message": "statusMessage",
    "goal": "goal",
    "model_string": "modelString",
    "is_pending": "isPending",
    "is_updating_memory": "isUpdatingMemory",
    "is_participating": "isParticipating",
    "money": "money",
    "paused_until": "pausedUntil",
    "current_room_id": "currentRoomId",
    "village_id": "villageId",
    "input_tokens_used": "inputTokensUsed",
    "output_tokens_used": "outputTokensUsed",
    "created_at": "createdAt",
    "updated_at": "updatedAt",
}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    cur = conn.execute(f"SELECT {', '.join(COLUMNS)} FROM agents ORDER BY name")
    agents = [
        {FIELD_MAP[col]: val for col, val in zip(COLUMNS, row)}
        for row in cur
    ]

    with open(OUT_DIR / "agents.json", "w", encoding="utf-8") as f:
        json.dump(agents, f, ensure_ascii=False)

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
    manifest["agents"] = {"count": len(agents), "file": "agents.json"}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False))

    print(f"{len(agents)} agents written to {OUT_DIR / 'agents.json'}")


if __name__ == "__main__":
    main()
