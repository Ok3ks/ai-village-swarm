"""
Builds an undirected agent-to-agent communication graph from chat_messages
(ai_village.db): an edge (A, B) is incremented every time A's message
@-mentions B (or vice versa), which is the only direct signal in this data
of one agent addressing another specifically (room co-membership alone
doesn't tell you who's talking to whom).

Output: frontend/public/data/agent_comms.json -- a flat list of
{a, b, count} edges, keyed by agent id.

Run: python3 export_agent_comms.py
"""
import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

DB = "ai_village.db"
OUT_DIR = Path("frontend/public/data")
MANIFEST = OUT_DIR / "manifest.json"


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)

    name_to_id = {}
    for agent_id, name in conn.execute("SELECT id, name FROM agents WHERE name IS NOT NULL"):
        name_to_id.setdefault(name, agent_id)

    # Longest names first so e.g. "Claude Opus 4.8" matches before "Claude".
    names_sorted = sorted(name_to_id.keys(), key=len, reverse=True)
    pattern = re.compile(r"@(" + "|".join(re.escape(n) for n in names_sorted) + r")\b")

    edge_counts = defaultdict(int)
    cur = conn.execute(
        "SELECT agent_speaker_id, content FROM chat_messages "
        "WHERE agent_speaker_id IS NOT NULL AND content IS NOT NULL"
    )
    for speaker_id, content in cur:
        for m in pattern.finditer(content):
            mentioned_id = name_to_id.get(m.group(1))
            if not mentioned_id or mentioned_id == speaker_id:
                continue
            key = tuple(sorted((speaker_id, mentioned_id)))
            edge_counts[key] += 1

    edges = [{"a": a, "b": b, "count": c} for (a, b), c in edge_counts.items()]
    edges.sort(key=lambda e: -e["count"])

    with open(OUT_DIR / "agent_comms.json", "w", encoding="utf-8") as f:
        json.dump(edges, f, ensure_ascii=False)

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
    manifest["agentComms"] = {"count": len(edges), "file": "agent_comms.json"}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False))

    print(f"{len(edges)} agent communication edges written to {OUT_DIR / 'agent_comms.json'}")


if __name__ == "__main__":
    main()
