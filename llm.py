"""
Thin client for the local LLM server started by llm.sh (OpenAI-compatible
vllm endpoint).

Reads LLM_URL from the environment (see .env.template), e.g.
    export LLM_URL=localhost:8000/v1

Run directly for a smoke test once the server is up:
    poetry run python3 llm.py
"""
import os

from openai import OpenAI

MODEL = "mlx-community/Qwen3.8-27B-4bit"


def client() -> OpenAI:
    url = os.environ.get("LLM_URL", "localhost:8000/v1")
    if not url.startswith("http"):
        url = f"http://{url}"
    return OpenAI(base_url=url, api_key="not-needed")


def chat(messages, model=MODEL, **kw) -> str:
    resp = client().chat.completions.create(model=model, messages=messages, **kw)
    return resp.choices[0].message.content


if __name__ == "__main__":
    print(chat([{"role": "user", "content": "Reply with just: pong"}]))
