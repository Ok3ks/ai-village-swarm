"""
Exports chat_messages (ai_village.db) grouped by room, chunked, so the Rooms
tab can actually show what was said in a room instead of just static
metadata (whitelist/blacklist/timestamps).

Output: frontend/public/data/room_messages/<room_id>/chunk-XXXX.json (each
an array of Turn-shaped dicts, CHUNK_SIZE messages, oldest first) plus a
"roomMessages" map in manifest.json: { roomId: {count, chunkFiles} }.

Run: python3 export_room_messages.py
"""
import json
import sqlite3
from pathlib import Path

DB = "ai_village.db"
OUT_DIR = Path("frontend/public/data")
ROOMS_DIR = OUT_DIR / "room_messages"
MANIFEST = OUT_DIR / "manifest.json"
CHUNK_SIZE = 1000


def main():
    ROOMS_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    agent_names = dict(conn.execute("SELECT id, name FROM agents"))
    room_ids = [r[0] for r in conn.execute("SELECT id FROM chat_rooms")]

    manifest_entry = {}
    for room_id in room_ids:
        room_dir = ROOMS_DIR / room_id
        room_dir.mkdir(parents=True, exist_ok=True)
        cur = conn.execute(
            "SELECT id, agent_speaker_id, user_speaker_id, speaker_type, content, created_at "
            "FROM chat_messages WHERE room_id = ? ORDER BY created_at",
            (room_id,),
        )
        chunk_files = []
        total = 0
        chunk_i = 0
        while True:
            rows = cur.fetchmany(CHUNK_SIZE)
            if not rows:
                break
            turns = []
            for mid, agent_id, user_id, speaker_type, content, created_at in rows:
                speaker = agent_names.get(agent_id) or user_id or "unknown"
                turns.append({
                    "id": mid,
                    "kind": "chat",
                    "subtype": speaker_type,
                    "cite": speaker,
                    "createdAt": created_at,
                    "text": content or "",
                })
            chunk_name = f"chunk-{chunk_i:04d}.json"
            with open(room_dir / chunk_name, "w", encoding="utf-8") as f:
                json.dump(turns, f, ensure_ascii=False)
            chunk_files.append(f"room_messages/{room_id}/{chunk_name}")
            total += len(rows)
            chunk_i += 1
        manifest_entry[room_id] = {"count": total, "chunkFiles": chunk_files}
        print(f"{room_id}: {total} messages across {len(chunk_files)} chunks")

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
    manifest["roomMessages"] = manifest_entry
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()
