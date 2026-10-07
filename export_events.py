"""
Exports the `events` table (ai_village.db) -- the raw simulation action log
(381k+ rows: AGENT_TALK, CONSOLIDATE, PAUSE, ENTER_ROOM, ...) -- to chunked
JSON for the frontend, same chunking scheme as export_transcripts.py since
it's too large to load as one file.

Output layout (under frontend/public/data/):
  events/chunk-XXXX.json       - full detail, CHUNK_SIZE events per file
  events_index/chunk-XXXX.json - lightweight index rows for the sidebar

Each event is modeled as a single-turn "tree" (root = the event, no
children) so it reuses the existing Tree/TranscriptSummary viewer shape.
Filter by action type reuses the sidebar's existing kind-chip mechanism:
kindCounts is keyed by the event's action_type instead of a TurnKind.

Run: python3 export_events.py
"""
import json
import sqlite3
from pathlib import Path

DB = "ai_village.db"
OUT_DIR = Path("frontend/public/data")
EVENTS_DIR = OUT_DIR / "events"
INDEX_DIR = OUT_DIR / "events_index"
MANIFEST = OUT_DIR / "manifest.json"
CHUNK_SIZE = 2000
PREVIEW_LEN = 180

COLUMNS = [
    "id", "action_type", "agent_id", "speaker_id", "speaker_name", "room_id",
    "content", "session_goal", "summary", "next_session_goal", "query",
    "cost", "input_tokens", "output_tokens", "village_id", "created_at",
]


def render_text(row):
    d = dict(zip(COLUMNS, row))
    parts = []
    if d["content"]:
        parts.append(d["content"])
    if d["session_goal"]:
        parts.append(f"[session goal] {d['session_goal']}")
    if d["summary"]:
        parts.append(f"[summary] {d['summary']}")
    if d["next_session_goal"]:
        parts.append(f"[next session goal] {d['next_session_goal']}")
    if d["query"]:
        parts.append(f"[query] {d['query']}")
    if d["cost"] or d["input_tokens"] or d["output_tokens"]:
        parts.append(
            f"[cost=${d['cost'] or 0:.4f} in={d['input_tokens'] or 0} out={d['output_tokens'] or 0}]"
        )
    return "\n\n".join(parts) if parts else "(no content captured)"


def to_turn(row, agent_names):
    d = dict(zip(COLUMNS, row))
    speaker = d["speaker_name"] or agent_names.get(d["agent_id"]) or d["agent_id"] or d["speaker_id"]
    return {
        "id": d["id"],
        "kind": "event",
        "subtype": d["action_type"],
        "cite": f"{speaker or 'unknown'} in room {d['room_id']}" if d["room_id"] else speaker,
        "createdAt": d["created_at"],
        "text": render_text(row),
    }


def preview_of(text):
    text = " ".join((text or "").split())
    return text[:PREVIEW_LEN]


def main():
    EVENTS_DIR.mkdir(parents=True, exist_ok=True)
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    agent_names = dict(conn.execute("SELECT id, name FROM agents"))

    cur = conn.execute(
        f"SELECT {', '.join(COLUMNS)} FROM events ORDER BY event_index"
    )

    index_chunk_files = []
    total = 0
    chunk_i = 0
    while True:
        rows = cur.fetchmany(CHUNK_SIZE)
        if not rows:
            break
        chunk_name = f"chunk-{chunk_i:04d}.json"
        chunk_payload, index_rows = [], []
        for idx, row in enumerate(rows):
            d = dict(zip(COLUMNS, row))
            turn = to_turn(row, agent_names)
            chunk_payload.append({"root": turn, "turns": []})
            index_rows.append({
                "id": turn["id"],
                "cite": turn["cite"],
                "preview": preview_of(turn["text"]),
                "turnCount": 0,
                "kindCounts": {d["action_type"]: 1},
                "hasChildren": False,
                "agentId": d["agent_id"],
                "agentName": agent_names.get(d["agent_id"]),
                "startTime": d["created_at"],
                "chunkFile": f"events/{chunk_name}",
                "chunkIndex": idx,
            })
        with open(EVENTS_DIR / chunk_name, "w", encoding="utf-8") as f:
            json.dump(chunk_payload, f, ensure_ascii=False)
        with open(INDEX_DIR / chunk_name, "w", encoding="utf-8") as f:
            json.dump(index_rows, f, ensure_ascii=False)
        index_chunk_files.append(f"events_index/{chunk_name}")
        total += len(rows)
        chunk_i += 1

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
    manifest["events"] = {"count": total, "indexChunks": index_chunk_files}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False))

    print(f"{total} events written across {len(index_chunk_files)} chunks")


if __name__ == "__main__":
    main()
