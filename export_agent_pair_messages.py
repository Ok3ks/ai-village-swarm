"""
For every agent pair with at least one @-mention edge (see
export_agent_comms.py), exports the actual messages that make up that
edge -- every message where A @-mentions B or B @-mentions A -- so the
Network tab's correspondents table can show the real exchange behind a
mention count, not just the count itself.

Output: frontend/public/data/agent_pairs/<a>_<b>/chunk-XXXX.json (each an
array of Turn-shaped dicts, CHUNK_SIZE messages, oldest first) plus an
"agentPairMessages" map in manifest.json: { "<a>_<b>": {count, chunkFiles} }.

Run: python3 export_agent_pair_messages.py
"""
import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

DB = "ai_village.db"
OUT_DIR = Path("frontend/public/data")
PAIRS_DIR = OUT_DIR / "agent_pairs"
MANIFEST = OUT_DIR / "manifest.json"
CHUNK_SIZE = 1000


def pair_key(a, b):
    lo, hi = sorted((a, b))
    return f"{lo}_{hi}"


def main():
    PAIRS_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)

    agent_names = dict(conn.execute("SELECT id, name FROM agents"))
    name_to_id = {}
    for agent_id, name in agent_names.items():
        if name:
            name_to_id.setdefault(name, agent_id)

    # Longest names first so e.g. "Claude Opus 4.8" matches before "Claude".
    # A generic single-token fallback (no spaces) comes last in the
    # alternation, so it only kicks in once none of the known full names
    # match at that position -- this is what catches "@george", a human
    # village operator with no row in `agents` who'd otherwise be dropped.
    names_sorted = sorted(name_to_id.keys(), key=len, reverse=True)
    known_alt = "|".join(re.escape(n) for n in names_sorted)
    generic_alt = r"\w[\w'-]*"
    alternatives = f"{known_alt}|{generic_alt}" if known_alt else generic_alt
    pattern = re.compile(r"@(" + alternatives + r")\b")

    pair_messages = defaultdict(list)
    cur = conn.execute(
        "SELECT id, agent_speaker_id, content, created_at FROM chat_messages "
        "WHERE agent_speaker_id IS NOT NULL AND content IS NOT NULL"
    )
    for mid, speaker_id, content, created_at in cur:
        # A message can @-mention the same name more than once (e.g. "@X ...
        # @X thanks") -- dedupe per message so it isn't added to a pair's
        # conversation twice.
        mentioned_ids = {name_to_id.get(m.group(1)) or m.group(1).lower() for m in pattern.finditer(content)}
        mentioned_ids.discard(speaker_id)
        for mentioned_id in mentioned_ids:
            key = pair_key(speaker_id, mentioned_id)
            pair_messages[key].append({
                "id": mid,
                "kind": "chat",
                "subtype": "mention",
                "cite": agent_names.get(speaker_id) or speaker_id,
                "createdAt": created_at,
                "text": content or "",
            })

    manifest_entry = {}
    for key, turns in pair_messages.items():
        turns.sort(key=lambda t: t["createdAt"])
        pair_dir = PAIRS_DIR / key
        pair_dir.mkdir(parents=True, exist_ok=True)
        chunk_files = []
        for chunk_i, start in enumerate(range(0, len(turns), CHUNK_SIZE)):
            chunk = turns[start:start + CHUNK_SIZE]
            chunk_name = f"chunk-{chunk_i:04d}.json"
            with open(pair_dir / chunk_name, "w", encoding="utf-8") as f:
                json.dump(chunk, f, ensure_ascii=False)
            chunk_files.append(f"agent_pairs/{key}/{chunk_name}")
        manifest_entry[key] = {"count": len(turns), "chunkFiles": chunk_files}

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
    manifest["agentPairMessages"] = manifest_entry
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False))

    print(f"{len(manifest_entry)} agent pairs written to {PAIRS_DIR}")


if __name__ == "__main__":
    main()
