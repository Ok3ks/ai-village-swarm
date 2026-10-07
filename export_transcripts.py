"""
Exports datasets/redacted.jsonl.gz (swarmtraces payload/response/recovered_text
records, linked by parent_id) into a Petri-viewer-friendly shape for the
frontend: a lightweight search index plus chunked transcript-detail files.

Output layout (under frontend/public/data/):
  index.json                 - one summary row per transcript (payload root)
  chunks/chunk-XXXX.json     - full detail for trees that have >=1 child turn
  orphan_chunks/chunk-XXXX.json - full detail for lone payloads (no captured
                                  response/recovered_text)

A "transcript" here means a root payload plus every record whose parent_id
chain leads back to it (depth is at most 2 in this dataset, but the code
does not assume that).

Run: python3 export_transcripts.py
"""
import gzip
import json
from collections import defaultdict
from pathlib import Path

SRC = Path("datasets/redacted.jsonl.gz")
OUT_DIR = Path("frontend/public/data")
CHUNK_SIZE = 500
PREVIEW_LEN = 180


def load_records():
    records = {}
    with gzip.open(SRC, "rt", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            d = json.loads(line)
            records[d["id"]] = d
    return records


def build_trees(records):
    children = defaultdict(list)
    roots = []
    for d in records.values():
        if d.get("parent_id"):
            children[d["parent_id"]].append(d["id"])
        else:
            roots.append(d["id"])
    return roots, children


def to_turn(d):
    tags = [t for t in (d.get("tags") or "").split(";") if t]
    return {
        "id": d["id"],
        "kind": d["kind"],
        "cite": d.get("cite"),
        "parentId": d.get("parent_id"),
        "tags": tags,
        "text": d.get("text") or "",
    }


def preview_of(text):
    text = " ".join((text or "").split())
    return text[:PREVIEW_LEN]


def write_chunks(trees, out_subdir):
    data_dir = OUT_DIR / out_subdir
    index_dir = OUT_DIR / f"{out_subdir}_index"
    data_dir.mkdir(parents=True, exist_ok=True)
    index_dir.mkdir(parents=True, exist_ok=True)
    index_chunk_files = []
    for chunk_i in range(0, len(trees), CHUNK_SIZE):
        chunk = trees[chunk_i:chunk_i + CHUNK_SIZE]
        chunk_name = f"chunk-{chunk_i // CHUNK_SIZE:04d}.json"
        chunk_payload = []
        index_rows = []
        for idx, tree in enumerate(chunk):
            chunk_payload.append(tree)
            root = tree["root"]
            kind_counts = defaultdict(int)
            for t in tree["turns"]:
                kind_counts[t["kind"]] += 1
            index_rows.append({
                "id": root["id"],
                "cite": root.get("cite"),
                "tags": root.get("tags") or [],
                "preview": preview_of(root.get("text")),
                "turnCount": len(tree["turns"]),
                "kindCounts": dict(kind_counts),
                "hasChildren": len(tree["turns"]) > 0,
                "chunkFile": f"{out_subdir}/{chunk_name}",
                "chunkIndex": idx,
            })
        with open(data_dir / chunk_name, "w", encoding="utf-8") as f:
            json.dump(chunk_payload, f, ensure_ascii=False)
        with open(index_dir / chunk_name, "w", encoding="utf-8") as f:
            json.dump(index_rows, f, ensure_ascii=False)
        index_chunk_files.append(f"{out_subdir}_index/{chunk_name}")
    return index_chunk_files, len(trees)


def main():
    print(f"reading {SRC} ...")
    records = load_records()
    roots, children = build_trees(records)
    print(f"{len(records)} records, {len(roots)} root payloads")

    trees, orphans = [], []
    for rid in roots:
        root = records[rid]
        kids = [records[k] for k in children.get(rid, [])]
        tree = {"root": to_turn(root), "turns": [to_turn(k) for k in kids]}
        (trees if kids else orphans).append(tree)

    print(f"{len(trees)} trees with captured responses, {len(orphans)} orphan payloads")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tree_chunks, tree_count = write_chunks(trees, "chunks")
    orphan_chunks, orphan_count = write_chunks(orphans, "orphan_chunks")

    with open(OUT_DIR / "manifest.json", "w", encoding="utf-8") as f:
        json.dump({
            "source": "datasets/redacted.jsonl.gz",
            "chunkSize": CHUNK_SIZE,
            "trees": {"count": tree_count, "indexChunks": tree_chunks},
            "orphans": {"count": orphan_count, "indexChunks": orphan_chunks},
        }, f, ensure_ascii=False)

    print(f"wrote manifest: {tree_count} trees across {len(tree_chunks)} chunks, "
          f"{orphan_count} orphans across {len(orphan_chunks)} chunks")


if __name__ == "__main__":
    main()
