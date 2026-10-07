"""
Exports claude_code_messages (ai_village.db, populated by ingest.py from the
aidigestorg/ai-village HF dataset) into Petri-viewer-friendly transcripts.

Each row is a raw Claude Code SDK stream message (type: user/assistant/
system/result) in native Anthropic message-block format. A single
sdk_session_id can span months of resumed CLI invocations (one agent in this
dataset racked up 244k messages under one id), so rows are first grouped by
sdk_session_id and then split into transcripts at any gap > SESSION_GAP_S
between consecutive messages -- this approximates individual Claude Code
invocations.

Output: frontend/public/data/claude_code/<transcript-id>.json (one file per
transcript, full turn detail) plus an index appended into manifest.json.

Run: python3 export_claude_code.py
"""
import json
import sqlite3
from pathlib import Path

DB = "ai_village.db"
OUT_DIR = Path("frontend/public/data")
CC_DIR = OUT_DIR / "claude_code"
MANIFEST = OUT_DIR / "manifest.json"
SESSION_GAP_S = 900  # 15 minutes
PREVIEW_LEN = 180


def block_text(b):
    t = b.get("type")
    if t == "text":
        return b.get("text", "")
    if t in ("thinking", "redacted_thinking"):
        return f"[thinking] {b.get('thinking', b.get('data', ''))}"
    if t == "tool_use":
        return f"[tool_use: {b.get('name')}] {json.dumps(b.get('input', {}), ensure_ascii=False)}"
    if t == "tool_result":
        inner = b.get("content")
        if isinstance(inner, list):
            inner = " ".join(block_text(x) if isinstance(x, dict) else str(x) for x in inner)
        err = " (error)" if b.get("is_error") else ""
        return f"[tool_result{err}] {inner}"
    return json.dumps(b, ensure_ascii=False)


def render_text(d):
    """Flatten a raw claude-code-SDK message dict into readable text."""
    mtype = d.get("type")
    if mtype in ("user", "assistant"):
        content = d.get("message", {}).get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return "\n\n".join(block_text(b) for b in content if isinstance(b, dict))
        return ""
    if mtype == "system":
        subtype = d.get("subtype")
        if subtype == "init":
            return f"[session init] cwd={d.get('cwd')} model={d.get('model')} tools={len(d.get('tools', []))}"
        return f"[system:{subtype}]"
    if mtype == "result":
        usage = d.get("modelUsage") or {}
        cost = sum(m.get("costUSD", 0) for m in usage.values())
        result = d.get("result") or d.get("error") or ""
        return f"{result}\n\n[turns={d.get('num_turns')} cost=${cost:.4f}]"
    return json.dumps(d, ensure_ascii=False)


def role_of(d):
    return d.get("type", "unknown")


def parse_ts(s):
    return s.split(".")[0] if s else s


def load_agent_names(conn):
    return dict(conn.execute("SELECT id, name FROM agents"))


def iter_rows(conn):
    cur = conn.execute(
        "SELECT id, agent_id, sdk_session_id, message_type, message_subtype, "
        "content, created_at FROM claude_code_messages "
        "ORDER BY sdk_session_id, created_at"
    )
    for row in cur:
        yield row


def flush_segment(agent_id, agent_name, sdk_session_id, seg_idx, rows, index_rows):
    if not rows:
        return
    turns = []
    for mid, _agent_id, _sdk, mtype, subtype, content, created_at in rows:
        d = json.loads(content) if isinstance(content, str) else (content or {})
        turns.append({
            "id": mid,
            "kind": mtype,
            "subtype": subtype,
            "createdAt": created_at,
            "text": render_text(d),
        })
    transcript_id = f"cc-{sdk_session_id[:8]}-{seg_idx:03d}"
    preview_turn = next((t for t in turns if t["text"].strip()), turns[0])
    kind_counts = {}
    for t in turns:
        kind_counts[t["kind"]] = kind_counts.get(t["kind"], 0) + 1
    out_path = CC_DIR / f"{transcript_id}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({
            "id": transcript_id,
            "agentId": agent_id,
            "agentName": agent_name,
            "sdkSessionId": sdk_session_id,
            "startTime": rows[0][6],
            "endTime": rows[-1][6],
            "turns": turns,
        }, f, ensure_ascii=False)
    preview = " ".join(preview_turn["text"].split())[:PREVIEW_LEN]
    index_rows.append({
        "id": transcript_id,
        "agentId": agent_id,
        "agentName": agent_name,
        "sdkSessionId": sdk_session_id,
        "startTime": rows[0][6],
        "endTime": rows[-1][6],
        "turnCount": len(turns),
        "kindCounts": kind_counts,
        "preview": preview,
        "file": f"claude_code/{transcript_id}.json",
    })


def main():
    CC_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB)
    agent_names = load_agent_names(conn)

    index_rows = []
    cur_sdk = None
    cur_agent = None
    seg_idx = 0
    last_ts = None
    buf = []

    for mid, agent_id, sdk_session_id, mtype, subtype, content, created_at in iter_rows(conn):
        ts = parse_ts(created_at)
        new_session = sdk_session_id != cur_sdk
        gap_broken = (
            not new_session and last_ts is not None and
            _seconds_between(last_ts, ts) > SESSION_GAP_S
        )
        if new_session or gap_broken:
            flush_segment(cur_agent, agent_names.get(cur_agent), cur_sdk, seg_idx, buf, index_rows)
            seg_idx = seg_idx + 1 if not new_session else 0
            buf = []
        cur_sdk, cur_agent, last_ts = sdk_session_id, agent_id, ts
        buf.append((mid, agent_id, sdk_session_id, mtype, subtype, content, created_at))
    flush_segment(cur_agent, agent_names.get(cur_agent), cur_sdk, seg_idx, buf, index_rows)

    print(f"{len(index_rows)} claude-code transcripts written to {CC_DIR}")

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
    manifest["claudeCode"] = {"count": len(index_rows), "transcripts": index_rows}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False))


def _seconds_between(a, b):
    import datetime
    fmt = "%Y-%m-%d %H:%M:%S"
    return (datetime.datetime.strptime(b, fmt) - datetime.datetime.strptime(a, fmt)).total_seconds()


if __name__ == "__main__":
    main()
