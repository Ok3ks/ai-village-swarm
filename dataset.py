from datasets import load_dataset

SUBSET = [
    "agent_goals",
    "agent_memories",
    "agents",
    "chat_rooms",
    "chat_messages",
    "events",
    "summaries",
    "village_goals",
    "villages",
    "claude_code_messages",
    "computer_use_sessions",
    "computer_use_turns",
    "claude_code_sessions",
]


def get_dataset(subset: str):
    assert subset in SUBSET, f"subset does not exist in {SUBSET}"
    turns = load_dataset("aidigestorg/ai-village", subset, split="train")
    return turns


if __name__ == "__main__":
    for set in SUBSET:
        dataset = get_dataset(set)
        d = dataset.split
        break
