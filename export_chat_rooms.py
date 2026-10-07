"""
Exports the `chat_rooms` table (ai_village.db) to
frontend/public/data/chat_rooms.json -- small (16 rows), previously
unexported/invisible in the viewer.

Run: python3 export_chat_rooms.py
"""
import json
import sqlite3
from pathlib import Path

DB = "ai_village.db"
OUT_DIR = Path("frontend/public/data")
MANIFEST = OUT_DIR / "manifest.json"

COLUMNS = [
    "id", "name", "village_id", "created_at", "updated_at",
    "last_nudger_run_at", "whitelisted_agent_names", "blacklisted_agent_names",
]

FIELD_MAP = {
    "id": "id",
    "name": "name",
    "village_id": "villageId",
    "created_at": "createdAt",
    "updated_at": "updatedAt",
    "last_nudger_run_at": "lastNudgerRunAt",
    "whitelisted_agent_names": "whitelistedAgentNames",
    "blacklisted_agent_names": "blacklistedAgentNames",
}


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    cur = conn.execute(f"SELECT {', '.join(COLUMNS)} FROM chat_rooms ORDER BY name")
    rooms = []
    for row in cur:
        rec = {FIELD_MAP[col]: val for col, val in zip(COLUMNS, row)}
        for key in ("whitelistedAgentNames", "blacklistedAgentNames"):
            if isinstance(rec[key], str):
                rec[key] = json.loads(rec[key])
        rooms.append(rec)

    with open(OUT_DIR / "chat_rooms.json", "w", encoding="utf-8") as f:
        json.dump(rooms, f, ensure_ascii=False)

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
    manifest["chatRooms"] = {"count": len(rooms), "file": "chat_rooms.json"}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False))

    print(f"{len(rooms)} chat rooms written to {OUT_DIR / 'chat_rooms.json'}")


if __name__ == "__main__":
    main()
