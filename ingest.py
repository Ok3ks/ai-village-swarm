import json
from sqlalchemy import insert
from sqlalchemy.orm import Session

from dataset import get_dataset
from db import (
    Base,
    engine,
    BATCH,
    enrich_event,
    Village,
    Agent,
    AgentGoal,
    VillageGoal,
    ChatRoom,
    ChatMessage,
    Summary,
    AgentMemory,
    ComputerUseSession,
    ClaudeCodeSession,
    ClaudeCodeMessage,
    Event,
    ComputerUseTurn,
)

# HF/polars leaves these as raw JSON strings rather than decoding them; the
# model columns are JSON-typed, so decode before binding or they'd be stored
# double-encoded.
JSON_STRING_COLUMNS = {
    ComputerUseTurn: ("agent_action", "agent_messages"),
    ClaudeCodeMessage: ("content",),
}

# subset name -> model; order matches db.py's `order` (parents before children)
LOAD_ORDER = [
    ("villages", Village),
    ("agents", Agent),
    ("agent_goals", AgentGoal),
    ("village_goals", VillageGoal),
    ("chat_rooms", ChatRoom),
    ("chat_messages", ChatMessage),
    ("summaries", Summary),
    ("agent_memories", AgentMemory),
    ("computer_use_sessions", ComputerUseSession),
    ("claude_code_sessions", ClaudeCodeSession),
    ("claude_code_messages", ClaudeCodeMessage),
    ("events", Event),
    ("computer_use_turns", ComputerUseTurn),
]


def _prepare_row(row, model):
    if model is Event:
        enrich_event(row, row)
        return
    for col in JSON_STRING_COLUMNS.get(model, ()):
        v = row.get(col)
        if isinstance(v, str):
            row[col] = json.loads(v)


def batches(subset, model):
    columns = None
    for df in get_dataset(subset).to_polars(batch_size=BATCH, batched=True):
        if columns is None:
            columns = [c.key for c in model.__table__.columns if c.key in df.columns]
        rows = df.select(columns).to_dicts()
        for row in rows:
            _prepare_row(row, model)
        yield rows


def load_subset(session, subset, model):
    stmt = insert(model.__table__).prefix_with("OR IGNORE")
    n = 0
    for chunk in batches(subset, model):
        session.execute(stmt, chunk)
        session.commit()
        n += len(chunk)
    return n


if __name__ == "__main__":
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        for subset, model in LOAD_ORDER:
            n = load_subset(session, subset, model)
            print(f"{subset}: {n} rows")
