import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.api.app import app
from src.logic.demo import FIXTURES, stream_chat
from src.schemas.models import ChatInput

client = TestClient(app)


def chat_input(text="始めたい"):
    return {
        "threadId": "thread-test",
        "runId": "run-test",
        "state": {},
        "tools": [],
        "context": [],
        "forwardedProps": {},
        "messages": [{"id": "u", "role": "user", "content": text}],
    }


def test_suggestions_match_shared_fixtures():
    response = client.post("/v1/todo-suggestions", json={"goal": " 学習 "})
    assert response.status_code == 200
    assert response.json() == {
        "suggestions": [{"title": f"学習：{suffix}"} for suffix in FIXTURES["suggestion_suffixes"]],
        "model_version": FIXTURES["model_version"],
    }


@pytest.mark.parametrize("goal", ["", "  ", "a" * 501])
def test_invalid_suggestion_input(goal):
    assert client.post("/v1/todo-suggestions", json={"goal": goal}).status_code == 422


def test_safe_service_error():
    response = client.post("/v1/todo-suggestions", json={"goal": "[error]"})
    assert response.status_code == 503
    assert response.json()["code"] == "UNAVAILABLE"
    assert "Traceback" not in response.text


def test_normal_stream_and_shared_text():
    response = client.post("/v1/chat/stream", json=chat_input())
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    events = [
        json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
    ]
    assert events[0]["type"] == "RUN_STARTED"
    assert events[-1]["type"] == "RUN_FINISHED"
    assert [
        event["delta"] for event in events if event["type"] == "TEXT_MESSAGE_CONTENT"
    ] == FIXTURES["chat_deltas"]
    ids = {event["messageId"] for event in events if "messageId" in event}
    assert len(ids) == 1


def test_stream_error_and_disconnect():
    for scenario, terminal in [
        ("[stream-error]", "RUN_ERROR"),
        ("[disconnect]", "TEXT_MESSAGE_CONTENT"),
    ]:
        response = client.post("/v1/chat/stream", json=chat_input(scenario))
        events = [
            json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
        ]
        assert events[-1]["type"] == terminal
        assert all(event["type"] != "RUN_FINISHED" for event in events)


@pytest.mark.parametrize(
    "field,value",
    [
        ("tools", [{"name": "x", "description": "x", "parameters": {}}]),
        ("state", {"x": 1}),
        ("forwardedProps", {"model": "unsafe"}),
    ],
)
def test_no_extensions(field, value):
    data = chat_input()
    data[field] = value
    assert client.post("/v1/chat/stream", json=data).status_code == 422


def test_slow_logic_is_cancelled_at_await_boundary():
    async def run():
        generator = stream_chat(ChatInput.model_validate(chat_input("[slow]")))
        assert (await anext(generator)).type == "RUN_STARTED"
        assert (await anext(generator)).type == "STEP_STARTED"
        pending = asyncio.create_task(anext(generator))
        await asyncio.sleep(0.01)
        pending.cancel()
        with pytest.raises(asyncio.CancelledError):
            await pending
        with pytest.raises(StopAsyncIteration):
            await anext(generator)

    asyncio.run(run())


def test_saved_openapi_is_current():
    saved = Path(__file__).resolve().parents[3] / "packages/ds-contract/openapi.json"
    assert json.loads(saved.read_text()) == app.openapi()
