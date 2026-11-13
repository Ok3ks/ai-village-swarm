"""
Exports the structure of a Claude Code home directory (~/.claude) to
frontend/public/data/claude_home.json for the viewer's "~/.claude" tabs:
a size-annotated directory tree, per-project activity (sessions, prompts,
memories), and config (settings, skills, plugins, plans).

claude_home.json itself holds metadata only (sizes, counts, timestamps,
redacted settings). Unless --no-sensitive is passed, everything else that is
readable is exported too, under frontend/public/data/claude_home/: prompt
text, full session transcripts (subagents included), raw settings, and the
contents of every small text file -- credentials and auth state included.
Every node is labelled "secret" or "personal" so the viewer can flag it.
That directory is wiped on each run, and lives under the gitignored data dir.

Run: python3 export_claude_home.py [path/to/.claude] [--no-sensitive]
     (default path: ~/.claude, or $CLAUDE_HOME)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

from export_claude_code import block_text

OUT_DIR = Path("frontend/public/data")
MANIFEST = OUT_DIR / "manifest.json"
SENSITIVE_DIR = OUT_DIR / "claude_home"
# Larger files (and binaries) are listed in the tree but not copied.
MAX_FILE_BYTES = 1_000_000

# Children kept per directory in the structure tree; the rest are folded
# into a single "(N more)" node so huge dirs (file-history, session-env)
# don't bloat the export.
MAX_CHILDREN = 40
MAX_DEPTH = 4

# What each well-known top-level entry is for, shown in the Structure tab.
DESCRIPTIONS = {
    "settings.json": "User settings: model, permissions, hooks, env",
    "settings.local.json": "Machine-local settings overrides",
    "CLAUDE.md": "Global instructions loaded into every session",
    "projects": "Per-project session transcripts (*.jsonl) and memory/",
    "history.jsonl": "Every prompt typed, across all projects",
    "file-history": "Pre-edit file snapshots, used to rewind changes",
    "plans": "Plans written in plan mode",
    "skills": "Installed skills (SKILL.md per skill)",
    "plugins": "Installed plugins and marketplaces",
    "agents": "Custom subagent definitions",
    "commands": "Custom slash commands",
    "sessions": "Live session state",
    "session-env": "Per-session environment snapshots",
    "shell-snapshots": "Shell environment captured for the Bash tool",
    "paste-cache": "Large pasted content, stored out of line",
    "backups": "Backups of config files",
    "cache": "Caches",
    "state": "Internal state",
    "jobs": "Background jobs",
    "feedback": "Drafted feedback reports",
    "todos": "Per-session todo lists",
    "stats-cache.json": "Usage statistics cache",
}

SECRET_KEY = re.compile(r"key|token|secret|password|auth", re.I)

# Sensitivity labels shown in the viewer. "secret": credentials, auth state
# and environment captures. "personal": your own prompts, transcripts, pastes
# and file snapshots. Installed skills/plugins are left unlabelled.
SECRET_PATH = re.compile(
    r"auth|signature|credential|token|\.key$|(^|/)(session-env|shell-snapshots|backups)(/|$)"
    r"|^remote-settings|^policy-limits",
    re.I,
)
PERSONAL_PATH = re.compile(
    r"^(history\.jsonl|projects|paste-cache|file-history|plans|sessions|jobs|feedback|todos|cache"
    r"|stats-cache\.json|daemon\.log|CLAUDE\.md)(/|$)"
)
LEVEL = {None: 0, "personal": 1, "secret": 2}


def sensitivity(rel: str) -> str | None:
    if SECRET_PATH.search(rel):
        return "secret"
    if PERSONAL_PATH.search(rel):
        return "personal"
    return None


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def scan(path: Path, root: Path, depth: int = 0) -> dict:
    rel = str(path.relative_to(root)) if path != root else ""
    try:
        st = path.lstat()
    except OSError:
        return {"name": path.name, "path": rel, "isDir": False, "bytes": 0, "files": 0}
    if not path.is_dir() or path.is_symlink():
        return {"name": path.name, "path": rel, "isDir": False, "bytes": st.st_size, "files": 1, "mtime": iso(st.st_mtime)}

    children = []
    try:
        entries = list(path.iterdir())
    except OSError:
        entries = []
    for child in entries:
        children.append(scan(child, root, depth + 1))
    node = {
        "name": path.name or str(root),
        "path": rel,
        "isDir": True,
        "bytes": sum(c["bytes"] for c in children),
        "files": sum(c["files"] for c in children),
        "mtime": iso(max([st.st_mtime] + [_mtime(c) for c in children])),
    }
    if depth < MAX_DEPTH:
        children.sort(key=lambda c: c["bytes"], reverse=True)
        kept, rest = children[:MAX_CHILDREN], children[MAX_CHILDREN:]
        if rest:
            name = f"({len(rest)} more)"
            kept.append({
                "name": name,
                "path": f"{rel}/{name}" if rel else name,
                "isDir": False,
                "folded": True,
                "bytes": sum(c["bytes"] for c in rest),
                "files": sum(c["files"] for c in rest),
            })
        node["children"] = kept
    return node


def _mtime(node: dict) -> float:
    m = node.get("mtime")
    return datetime.strptime(m, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc).timestamp() if m else 0


def is_transcript(rel: str) -> bool:
    # Shown in the Projects tab as threads instead of raw JSONL.
    return rel.startswith("projects/") and rel.endswith(".jsonl")


def annotate(node: dict, root: Path, out: Path | None) -> None:
    """Label sensitivity bottom-up (a dir is as sensitive as its most
    sensitive child) and, when exporting sensitive data, copy each small text
    file's content to out/files/."""
    kids = node.get("children") or []
    for c in kids:
        annotate(c, root, out)
    label = max([sensitivity(node["path"])] + [c.get("sensitivity") for c in kids], key=LEVEL.get)
    if label:
        node["sensitivity"] = label
    if out is None or node["isDir"] or node.get("folded") or node["bytes"] > MAX_FILE_BYTES:
        return
    if is_transcript(node["path"]):
        return
    try:
        text = (root / node["path"]).read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return  # binary or unreadable
    name = hashlib.sha1(node["path"].encode()).hexdigest()[:16] + ".txt"
    (out / "files" / name).write_text(text, encoding="utf-8")
    node["contentFile"] = f"{out.name}/files/{name}"


def frontmatter(text: str) -> tuple[dict, str]:
    """Minimal YAML-frontmatter parse: top-level and one-level-nested scalars."""
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        return {}, text
    meta: dict = {}
    parent = None
    for line in m.group(1).splitlines():
        kv = re.match(r"^(\s*)([\w-]+):\s*(.*)$", line)
        if not kv:
            continue
        indent, key, val = kv.groups()
        val = val.strip().strip('"').strip("'")
        if indent and parent is not None:
            meta.setdefault(parent, {})
            if isinstance(meta[parent], dict):
                meta[parent][key] = val
        else:
            meta[key] = val if val else {}
            parent = key
    return meta, m.group(2)


def redact(value, key: str = ""):
    if isinstance(value, dict):
        return {k: ("•••" if key == "env" else redact(v, k)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v, key) for v in value]
    if isinstance(value, str) and SECRET_KEY.search(key):
        return "•••"
    return value


def read_settings(root: Path) -> tuple[list[dict], list[dict]]:
    """(redacted, raw) settings -- raw only goes into the sensitive export."""
    redacted, raw = [], []
    for name in ("settings.json", "settings.local.json"):
        p = root / name
        if p.exists():
            try:
                settings = json.loads(p.read_text())
            except (OSError, json.JSONDecodeError) as e:
                redacted.append({"file": name, "error": str(e)})
                continue
            clean = redact(settings)
            redacted.append({"file": name, "settings": clean, "hasSecrets": clean != settings})
            raw.append({"file": name, "settings": settings})
    return redacted, raw


def read_skills(root: Path) -> list[dict]:
    skills = []
    for p in sorted((root / "skills").rglob("SKILL.md")) if (root / "skills").exists() else []:
        meta, _ = frontmatter(p.read_text(errors="replace"))
        skills.append({
            "name": meta.get("name") or p.parent.name,
            "description": meta.get("description") if isinstance(meta.get("description"), str) else "",
            "path": str(p.relative_to(root)),
            "source": "skills",
        })
    return skills


def read_plugins(root: Path) -> list[dict]:
    plugins = []
    synced = root / "plugins"
    if not synced.exists():
        return plugins
    for pj in sorted(synced.rglob(".claude-plugin/plugin.json")):
        if "marketplaces" in pj.parts:
            continue  # the full catalog, not what's installed
        plugin_dir = pj.parent.parent
        try:
            meta = json.loads(pj.read_text())
        except (OSError, json.JSONDecodeError):
            meta = {}
        plugin_skills = []
        for sp in sorted(plugin_dir.rglob("SKILL.md")):
            sm, _ = frontmatter(sp.read_text(errors="replace"))
            plugin_skills.append(sm.get("name") or sp.parent.name)
        plugins.append({
            "name": meta.get("name") or plugin_dir.name,
            "description": meta.get("description") or "",
            "version": meta.get("version"),
            "path": str(plugin_dir.relative_to(root)),
            "skills": plugin_skills,
            "hasMcp": (plugin_dir / ".mcp.json").exists(),
        })
    marketplaces = synced / "known_marketplaces.json"
    if marketplaces.exists():
        try:
            for name in json.loads(marketplaces.read_text()):
                plugins.append({"name": name, "description": "Plugin marketplace", "path": "plugins/marketplaces/" + name,
                                "skills": [], "hasMcp": False, "isMarketplace": True})
        except (OSError, json.JSONDecodeError):
            pass
    return plugins


def read_plans(root: Path) -> list[dict]:
    plans = []
    d = root / "plans"
    for p in sorted(d.glob("*.md")) if d.exists() else []:
        text = p.read_text(errors="replace")
        heading = next((l.lstrip("# ").strip() for l in text.splitlines() if l.startswith("#")), p.stem)
        plans.append({"name": p.stem, "title": heading, "mtime": iso(p.stat().st_mtime), "text": text})
    return plans


def slugify(project_path: str) -> str:
    # Claude Code names project dirs by replacing every non-alphanumeric char
    # of the cwd with "-".
    return re.sub(r"[^A-Za-z0-9]", "-", project_path)


# Bookkeeping records with nothing to read in a thread.
SKIP_RECORD_TYPES = {"mode", "permission-mode", "ai-title", "last-prompt", "file-history-snapshot", "queue-operation"}


def record_turn(rec: dict, idx: int) -> dict | None:
    rtype = rec.get("type")
    if rtype in SKIP_RECORD_TYPES:
        return None
    ts = rec.get("timestamp")
    turn = {
        "id": rec.get("uuid") or f"rec-{idx}",
        "createdAt": ts[:19].replace("T", " ") if isinstance(ts, str) else None,
    }
    if rtype in ("user", "assistant"):
        content = (rec.get("message") or {}).get("content")
        if isinstance(content, list):
            text = "\n\n".join(block_text(b) for b in content if isinstance(b, dict))
        else:
            text = content if isinstance(content, str) else ""
        return {**turn, "kind": rtype, "subtype": "meta" if rec.get("isMeta") else None, "text": text}
    if rtype == "attachment":
        att = rec.get("attachment") or {}
        return {**turn, "kind": "system", "subtype": f"attachment:{att.get('type')}",
                "text": json.dumps(att, ensure_ascii=False)[:20000]}
    extra = rec.get("content") or rec.get("summary") or ""
    return {**turn, "kind": "system", "subtype": rec.get("subtype") or rtype,
            "text": f"[{rtype}:{rec.get('subtype') or ''}] {extra if isinstance(extra, str) else json.dumps(extra)}"}


def session_meta(p: Path, out: Path | None, slug: str) -> dict:
    """Counts, time range and title; with `out`, also writes the full thread."""
    kinds: Counter = Counter()
    first = last = None
    cwd = title = None
    turns = []
    with p.open(errors="replace") as f:
        for i, line in enumerate(f):
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            kinds[rec.get("type", "other")] += 1
            ts = rec.get("timestamp")
            if isinstance(ts, str):
                first = first or ts
                last = ts
            cwd = cwd or rec.get("cwd")
            if rec.get("type") == "ai-title":
                title = rec.get("aiTitle") or title
            if out is not None and (turn := record_turn(rec, i)):
                turns.append(turn)
    st = p.stat()
    file = None
    if out is not None and turns:
        rel = Path("sessions") / slug / f"{p.stem}.json"
        (out / rel).parent.mkdir(parents=True, exist_ok=True)
        (out / rel).write_text(json.dumps({"turns": turns}, ensure_ascii=False), encoding="utf-8")
        file = f"{out.name}/{rel}"
    return {
        "title": title,
        "file": file,
        "id": p.stem,
        "bytes": st.st_size,
        "messages": sum(kinds.values()),
        "userMessages": kinds.get("user", 0),
        "assistantMessages": kinds.get("assistant", 0),
        "start": (first or iso(st.st_mtime))[:19].replace("T", " "),
        "end": (last or iso(st.st_mtime))[:19].replace("T", " "),
        "cwd": cwd,
    }


def resolve_pastes(root: Path, pasted: dict) -> list[str]:
    # Small pastes are inline; large ones live in paste-cache/<hash>.txt.
    out = []
    for v in (pasted or {}).values():
        if not isinstance(v, dict):
            continue
        text = v.get("content")
        if text is None and v.get("contentHash"):
            cached = root / "paste-cache" / f"{v['contentHash']}.txt"
            text = cached.read_text(errors="replace") if cached.exists() else f"[paste {v['contentHash']} not cached]"
        if text is not None:
            out.append(text)
    return out


def read_history(root: Path) -> tuple[dict[str, Counter], dict[str, list]]:
    """Prompts per project per day, plus the prompts themselves (text and
    resolved pastes), from history.jsonl."""
    per_project: dict[str, Counter] = defaultdict(Counter)
    prompts: dict[str, list] = defaultdict(list)
    p = root / "history.jsonl"
    if not p.exists():
        return per_project, prompts
    with p.open(errors="replace") as f:
        for line in f:
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            ts, project = rec.get("timestamp"), rec.get("project")
            if not isinstance(ts, (int, float)) or not project:
                continue
            when = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
            per_project[project][when.strftime("%Y-%m-%d")] += 1
            prompts[project].append({
                "createdAt": when.strftime("%Y-%m-%d %H:%M:%S"),
                "sessionId": rec.get("sessionId"),
                "text": rec.get("display") or "",
                "pastes": resolve_pastes(root, rec.get("pastedContents")),
            })
    return per_project, prompts


def read_projects(root: Path, out: Path | None) -> tuple[list[dict], dict[str, list]]:
    """Projects, plus (slug -> prompts) for the sensitive export."""
    history, prompts = read_history(root)
    path_by_slug = {slugify(p): p for p in history}
    projects = []
    prompts_by_slug = {}
    pdir = root / "projects"
    for d in sorted(pdir.iterdir()) if pdir.exists() else []:
        if not d.is_dir():
            continue
        top = sorted((session_meta(p, out, d.name) for p in d.glob("*.jsonl")), key=lambda s: s["start"], reverse=True)
        cwd = next((s["cwd"] for s in top if s["cwd"]), None) or path_by_slug.get(d.name) or d.name
        # Each top-level session is followed by the subagents it spawned
        # (<session-id>/subagents/agent-*.jsonl, described by *.meta.json).
        sessions = []
        for s in top:
            sessions.append(s)
            subs = []
            for sp in sorted((d / s["id"] / "subagents").glob("*.jsonl")):
                sub = session_meta(sp, out, d.name)
                meta_file = sp.with_suffix(".meta.json")
                meta = json.loads(meta_file.read_text()) if meta_file.exists() else {}
                sub["parentId"] = s["id"]
                sub["agentType"] = meta.get("agentType")
                sub["title"] = meta.get("description") or sub["title"]
                subs.append(sub)
            sessions.extend(sorted(subs, key=lambda x: x["start"]))
        for s in sessions:
            s.pop("cwd")
        top_ids = {s["id"] for s in top}
        sessions = [s for s in sessions if s["id"] in top_ids or s.get("parentId")]
        if out is not None:
            prompts_by_slug[d.name] = prompts.get(cwd, [])

        memories, memory_index = [], None
        mdir = d / "memory"
        for mp in sorted(mdir.glob("*.md")) if mdir.exists() else []:
            text = mp.read_text(errors="replace")
            if mp.name == "MEMORY.md":
                memory_index = text
                continue
            meta, body = frontmatter(text)
            md = meta.get("metadata") if isinstance(meta.get("metadata"), dict) else {}
            memories.append({
                "name": meta.get("name") or mp.stem,
                "description": meta.get("description") if isinstance(meta.get("description"), str) else "",
                "type": md.get("type") or meta.get("type") or "unknown",
                "mtime": iso(mp.stat().st_mtime),
                "links": sorted(set(re.findall(r"\[\[([^\]]+)\]\]", body))),
                "body": body.strip(),
            })

        prompts_by_day = history.get(cwd, Counter())
        times = [s["end"] for s in top] + [m["mtime"] for m in memories]
        projects.append({
            "slug": d.name,
            "path": cwd,
            "name": Path(cwd).name if cwd.startswith("/") else d.name,
            "bytes": sum(p.stat().st_size for p in d.rglob("*") if p.is_file()),
            "sessions": sessions,
            "sessionCount": len(top),
            "memories": memories,
            "memoryIndex": memory_index,
            "promptCount": sum(prompts_by_day.values()),
            "promptsByDay": dict(sorted(prompts_by_day.items())),
            "lastActive": max(times) if times else None,
        })
    # Disambiguate same-named projects (~/Code/blog vs ~/Code/pp/blog) by
    # prefixing the parent directory.
    names = Counter(p["name"] for p in projects)
    for p in projects:
        if names[p["name"]] > 1 and p["path"].startswith("/"):
            p["name"] = "/".join(Path(p["path"]).parts[-2:])
    projects.sort(key=lambda p: p["lastActive"] or "", reverse=True)
    return projects, prompts_by_slug


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", nargs="?", default=os.environ.get("CLAUDE_HOME", "~/.claude"))
    ap.add_argument("--no-sensitive", action="store_true", help="metadata only: no prompts, transcripts, secrets or file contents")
    args = ap.parse_args()
    root = Path(args.root).expanduser()
    if not root.is_dir():
        sys.exit(f"{root} is not a directory")

    # Always start clean, so a --no-sensitive run (or a deleted secret)
    # doesn't leave a previous export's contents behind.
    shutil.rmtree(SENSITIVE_DIR, ignore_errors=True)
    out = None if args.no_sensitive else SENSITIVE_DIR
    if out is not None:
        (out / "files").mkdir(parents=True)

    settings, raw_settings = read_settings(root)
    projects, prompts = read_projects(root, out)

    tree = scan(root, root)
    annotate(tree, root, out)
    for c in tree.get("children", []):
        c["description"] = DESCRIPTIONS.get(c["name"], "Auth/signature data" if SECRET_PATH.search(c["name"]) else "")
        # Settings only count as secret when they actually hold env/credential values.
        if any(s["file"] == c["name"] and s.get("hasSecrets") for s in settings):
            c["sensitivity"] = "secret"

    if out is not None:
        (out / "sensitive.json").write_text(
            json.dumps({"rawSettings": raw_settings, "prompts": prompts}, ensure_ascii=False), encoding="utf-8"
        )

    claude_md = root / "CLAUDE.md"
    home = {
        "root": str(root),
        "exportedAt": iso(datetime.now(tz=timezone.utc).timestamp()),
        "tree": tree,
        "settings": settings,
        "sensitiveFile": f"{out.name}/sensitive.json" if out is not None else None,
        "claudeMd": claude_md.read_text(errors="replace") if claude_md.exists() else None,
        "skills": read_skills(root),
        "plugins": read_plugins(root),
        "plans": read_plans(root),
        "projects": projects,
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with open(OUT_DIR / "claude_home.json", "w", encoding="utf-8") as f:
        json.dump(home, f, ensure_ascii=False)

    manifest = {}
    if MANIFEST.exists():
        manifest = json.loads(MANIFEST.read_text())
    manifest["claudeHome"] = {"count": len(home["projects"]), "file": "claude_home.json"}
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False))

    copied = sum(1 for _ in out.rglob("*") if _.is_file()) if out is not None else 0
    print(
        f"{root}: {tree['files']:,} files, {tree['bytes'] / 1e6:.1f} MB; "
        f"{'sensitive export: ' + str(copied) + ' files' if out is not None else 'metadata only'}; "
        f"{len(home['projects'])} projects, {len(home['skills'])} skills, "
        f"{len(home['plugins'])} plugins, {len(home['plans'])} plans -> {OUT_DIR / 'claude_home.json'}"
    )


if __name__ == "__main__":
    main()
