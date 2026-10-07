"""
Populates ai_village.db (sqlite, schema defined in db.py) from the
aidigestorg/ai-village HuggingFace dataset.

Run: poetry run python3 ingest.py
"""
import sys
from pathlib import Path

import db  # noqa: E402

# The repo has a local `datasets/` directory (swarmtraces corpus) which
# shadows the `datasets` pip package when this script's own directory is on
# sys.path. Drop it (now that db.py is already imported) before importing
# the HF package.
_REPO_ROOT = str(Path(__file__).resolve().parent)
sys.path = [p for p in sys.path if p not in ("", ".", _REPO_ROOT)]

from datasets import load_dataset  # noqa: E402

HF_DATASET = "aidigestorg/ai-village"


def main():
    db.Base.metadata.create_all(db.engine)
    with db.engine.begin() as conn:
        for model, subset in db.order:
            table = model.__table__
            columns = {c.name for c in table.columns}
            conn.execute(table.delete())

            ds = load_dataset(HF_DATASET, subset, split="train")
            batch, total = [], 0
            for row in ds:
                row = dict(row)
                if model is db.Event:
                    db.enrich_event(row, row)
                batch.append({k: v for k, v in row.items() if k in columns})
                if len(batch) >= db.BATCH:
                    conn.execute(table.insert(), batch)
                    total += len(batch)
                    batch.clear()
            if batch:
                conn.execute(table.insert(), batch)
                total += len(batch)
            print(f"{subset}: {total} rows -> {table.name}")


if __name__ == "__main__":
    main()
