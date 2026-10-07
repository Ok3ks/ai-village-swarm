import gzip, json, datetime as dt
from collections import defaultdict
from pathlib import Path
from typing import Optional
from sqlalchemy import create_engine, select, func, event, Text, String, JSON, Float
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, Session

DATA_DIR = Path("ai-village")
BATCH = 5000
engine = create_engine("sqlite:///ai_village.db")


@event.listens_for(engine, "connect")
def _pragmas(con, _):
    cur = con.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=OFF")
    cur.close()


class Base(DeclarativeBase):
    pass


def J():
    return mapped_column(JSON, nullable=True)


def TX(**kw):
    return mapped_column(Text, nullable=True, **kw)


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[Optional[str]]
    emoji: Mapped[Optional[str]]
    status_message: Mapped[Optional[str]] = TX()
    goal: Mapped[Optional[str]] = TX()
    model_string: Mapped[Optional[str]] = mapped_column(index=True)
    is_pending: Mapped[Optional[bool]]
    is_updating_memory: Mapped[Optional[bool]]
    is_participating: Mapped[Optional[bool]]
    is_paused_for_google_sign_in: Mapped[Optional[bool]]
    input_tokens_used: Mapped[Optional[int]]
    output_tokens_used: Mapped[Optional[int]]
    last_seen_event_index: Mapped[Optional[int]]
    money: Mapped[Optional[str]]
    paused_until: Mapped[Optional[str]]
    paused_until_task_id: Mapped[Optional[str]]
    current_computer_use_session_id: Mapped[Optional[str]]
    current_human_use_session_request_id: Mapped[Optional[str]]
    current_room_id: Mapped[Optional[str]]
    village_id: Mapped[Optional[str]]
    created_at: Mapped[Optional[str]]
    updated_at: Mapped[Optional[str]]

    goals: Mapped[list["AgentGoal"]] = relationship(
        back_populates="agent", primaryjoin="Agent.id==foreign(AgentGoal.agent_id)"
    )
    sessions: Mapped[list["ComputerUseSession"]] = relationship(
        back_populates="agent",
        primaryjoin="Agent.id==foreign(ComputerUseSession.agent_id)",
    )
    memories: Mapped[list["AgentMemory"]] = relationship(
        back_populates="agent", primaryjoin="Agent.id==foreign(AgentMemory.agent_id)"
    )
    messages: Mapped[list["ChatMessage"]] = relationship(
        back_populates="agent",
        primaryjoin="Agent.id==foreign(ChatMessage.agent_speaker_id)",
    )
    events: Mapped[list["Event"]] = relationship(
        back_populates="agent", primaryjoin="Agent.id==foreign(Event.agent_id)"
    )


class AgentGoal(Base):
    __tablename__ = "agent_goals"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[Optional[str]] = mapped_column(index=True)
    name: Mapped[Optional[str]]
    short_name: Mapped[Optional[str]]
    description: Mapped[Optional[str]] = TX()
    start_time: Mapped[Optional[str]]
    end_time: Mapped[Optional[str]]
    created_at: Mapped[Optional[str]]
    updated_at: Mapped[Optional[str]]
    agent: Mapped[Optional[Agent]] = relationship(
        back_populates="goals", primaryjoin="foreign(AgentGoal.agent_id)==Agent.id"
    )


class AgentMemory(Base):
    __tablename__ = "agent_memories"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    content: Mapped[Optional[str]] = TX()
    agent_id: Mapped[Optional[str]] = mapped_column(index=True)
    created_at: Mapped[Optional[str]] = mapped_column(index=True)
    updated_at: Mapped[Optional[str]]
    agent: Mapped[Optional[Agent]] = relationship(
        back_populates="memories", primaryjoin="foreign(AgentMemory.agent_id)==Agent.id"
    )


class ChatRoom(Base):
    __tablename__ = "chat_rooms"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[Optional[str]]
    village_id: Mapped[Optional[str]]
    created_at: Mapped[Optional[str]]
    updated_at: Mapped[Optional[str]]
    last_nudger_run_at: Mapped[Optional[str]]
    last_nudger_run_chat_message_id: Mapped[Optional[str]]
    deleted_at: Mapped[Optional[str]]
    whitelisted_agent_names: Mapped[Optional[list]] = J()
    blacklisted_agent_names: Mapped[Optional[list]] = J()


class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_speaker_id: Mapped[Optional[str]] = mapped_column(index=True)
    user_speaker_id: Mapped[Optional[str]]
    speaker_type: Mapped[Optional[str]]
    content: Mapped[Optional[str]] = TX()
    room_id: Mapped[Optional[str]] = mapped_column(index=True)
    has_been_approved: Mapped[Optional[bool]]
    created_at: Mapped[Optional[str]] = mapped_column(index=True)
    updated_at: Mapped[Optional[str]]
    agent: Mapped[Optional[Agent]] = relationship(
        back_populates="messages",
        primaryjoin="foreign(ChatMessage.agent_speaker_id)==Agent.id",
    )


class Event(Base):
    """Raw columns + enriched columns flattened from data."""

    __tablename__ = "events"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    event_index: Mapped[Optional[int]] = mapped_column(index=True)
    data: Mapped[Optional[dict]] = J()
    village_id: Mapped[Optional[str]]
    created_at: Mapped[Optional[str]] = mapped_column(index=True)
    updated_at: Mapped[Optional[str]]
    # enriched
    action_type: Mapped[Optional[str]] = mapped_column(index=True)
    agent_id: Mapped[Optional[str]] = mapped_column(
        index=True
    )  # agentId, else speakerId
    speaker_id: Mapped[Optional[str]]
    speaker_name: Mapped[Optional[str]]
    message_id: Mapped[Optional[str]] = mapped_column(index=True)
    room_id: Mapped[Optional[str]]
    computer_use_session_id: Mapped[Optional[str]] = mapped_column(index=True)
    content: Mapped[Optional[str]] = TX()
    session_goal: Mapped[Optional[str]] = TX()
    summary: Mapped[Optional[str]] = TX()
    next_session_goal: Mapped[Optional[str]] = TX()
    query: Mapped[Optional[str]] = TX()
    cost: Mapped[Optional[float]] = mapped_column(Float)
    input_tokens: Mapped[Optional[int]]
    output_tokens: Mapped[Optional[int]]
    agent: Mapped[Optional[Agent]] = relationship(
        back_populates="events", primaryjoin="foreign(Event.agent_id)==Agent.id"
    )


class ComputerUseSession(Base):
    __tablename__ = "computer_use_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[Optional[str]] = mapped_column(index=True)
    village_id: Mapped[Optional[str]]
    created_at: Mapped[Optional[str]]
    updated_at: Mapped[Optional[str]]
    has_been_asked_to_stop: Mapped[Optional[bool]]
    session_goal: Mapped[Optional[str]] = TX()
    short_displayed_session_goal: Mapped[Optional[str]] = TX()
    agent: Mapped[Optional[Agent]] = relationship(
        back_populates="sessions",
        primaryjoin="foreign(ComputerUseSession.agent_id)==Agent.id",
    )
    turns: Mapped[list["ComputerUseTurn"]] = relationship(
        back_populates="session",
        primaryjoin="ComputerUseSession.id==foreign(ComputerUseTurn.session_id)",
    )


class ComputerUseTurn(Base):
    """Columns per SCHEMA.md; not yet verified against HF features."""

    __tablename__ = "computer_use_turns"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[Optional[str]] = mapped_column(index=True)
    agent_action: Mapped[Optional[dict]] = J()
    agent_messages: Mapped[Optional[dict]] = J()
    output: Mapped[Optional[str]] = TX()
    error: Mapped[Optional[str]] = TX()
    system: Mapped[Optional[str]] = TX()
    screenshot_is_redacted: Mapped[Optional[bool]]
    has_redaction_been_overruled: Mapped[Optional[bool]]
    created_at: Mapped[Optional[str]] = mapped_column(index=True)
    updated_at: Mapped[Optional[str]]
    # enriched
    action_name: Mapped[Optional[str]] = mapped_column(index=True)
    session: Mapped[Optional[ComputerUseSession]] = relationship(
        back_populates="turns",
        primaryjoin="foreign(ComputerUseTurn.session_id)==ComputerUseSession.id",
    )


class Summary(Base):
    __tablename__ = "summaries"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    village_id: Mapped[Optional[str]]
    type: Mapped[Optional[str]] = mapped_column(index=True)
    summary_target: Mapped[Optional[str]]
    summary_date: Mapped[Optional[str]] = mapped_column(index=True)  # ISO string
    content: Mapped[Optional[str]] = TX()
    generated_by: Mapped[Optional[str]]
    created_at: Mapped[Optional[str]]
    updated_at: Mapped[Optional[str]]


class VillageGoal(Base):
    __tablename__ = "village_goals"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    village_id: Mapped[Optional[str]]
    goal: Mapped[Optional[str]] = TX()
    start_time: Mapped[Optional[str]]
    end_time: Mapped[Optional[str]]
    created_at: Mapped[Optional[str]]
    updated_at: Mapped[Optional[str]]


class Village(Base):
    __tablename__ = "villages"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[Optional[str]]
    slug: Mapped[Optional[str]]
    village_goal: Mapped[Optional[str]] = TX()
    active_agent_id: Mapped[Optional[str]]
    turn_id: Mapped[Optional[str]]
    schedule: Mapped[Optional[dict]] = J()
    is_chat_open: Mapped[Optional[bool]]
    created_at: Mapped[Optional[str]]
    updated_at: Mapped[Optional[str]]


class ClaudeCodeMessage(Base):
    __tablename__ = "claude_code_messages"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[Optional[str]] = mapped_column(index=True)
    sdk_session_id: Mapped[Optional[str]] = mapped_column(index=True)
    message_uuid: Mapped[Optional[str]]
    message_type: Mapped[Optional[str]]
    message_subtype: Mapped[Optional[str]]
    content: Mapped[Optional[dict]] = J()
    created_at: Mapped[Optional[str]]


class ClaudeCodeSession(Base):
    """Columns per SCHEMA.md; not yet verified against HF features."""

    __tablename__ = "claude_code_sessions"
    id: Mapped[str] = mapped_column(String, primary_key=True)
    agent_id: Mapped[Optional[str]]
    sdk_session_id: Mapped[Optional[str]]
    created_at: Mapped[Optional[str]]
    updated_at: Mapped[Optional[str]]


# ---------- enrichment ----------
def enrich_event(r, row):
    d = r.get("data") or {}
    if isinstance(d, str):
        d = json.loads(d)
    row["data"] = d
    cost = d.get("cost")
    try:
        cost = float(cost) if cost is not None else None
    except (TypeError, ValueError):
        cost = None
    row.update(
        action_type=d.get("actionType"),
        agent_id=d.get("agentId") or d.get("speakerId"),
        speaker_id=d.get("speakerId"),
        speaker_name=d.get("speakerName"),
        message_id=d.get("messageId"),
        room_id=d.get("roomId"),
        computer_use_session_id=d.get("computerUseSessionId"),
        content=d.get("content") if isinstance(d.get("content"), str) else None,
        session_goal=d.get("sessionGoal"),
        summary=d.get("summary") if isinstance(d.get("summary"), str) else None,
        next_session_goal=d.get("nextSessionGoal"),
        query=d.get("query"),
        cost=cost,
        input_tokens=d.get("inputTokens"),
        output_tokens=d.get("outputTokens"),
    )


# ---------- loading ----------
def read_jsonl(path):
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                yield json.loads(line)


if __name__ == "__main__":
    Base.metadata.create_all(engine)
    order = [
        (Village, "villages"),
        (Agent, "agents"),
        (AgentGoal, "agent_goals"),
        (VillageGoal, "village_goals"),
        (ChatRoom, "chat_rooms"),
        (ChatMessage, "chat_messages"),
        (Summary, "summaries"),
        (AgentMemory, "agent_memories"),
        (ComputerUseSession, "computer_use_sessions"),
        (ClaudeCodeSession, "claude_code_sessions"),
        (ClaudeCodeMessage, "claude_code_messages"),
        (Event, "events"),
        (ComputerUseTurn, "computer_use_turns"),
    ]
