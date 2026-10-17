import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.api.app import app
from src.logic.demo import FIXTURES, create_work_report, stream_chat
from src.schemas.models import ChatInput, WorkReportInput

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


def report_input(scenario="normal"):
    return {
        "total": 5,
        "completed": 2,
        "scenario": scenario,
        "next_todos": [{"id": "6c817ab8-0212-469c-aa82-624e6c7b55a1", "title": "設計を確認する"}],
    }


def test_work_report_shared_rule():
    response = client.post("/v1/work-report", json=report_input())
    assert response.status_code == 200
    rules = FIXTURES["work_report"]
    assert response.json() == {
        "summary": rules["summary_template"].format(total=5, completed=2, remaining=3),
        "next_steps": [rules["next_step_prefix"] + "設計を確認する" + rules["next_step_suffix"]],
        "model_version": FIXTURES["model_version"],
    }


def test_empty_work_report():
    response = client.post(
        "/v1/work-report",
        json={
            "total": 0,
            "completed": 0,
            "next_todos": [],
            "scenario": "normal",
        },
    )
    assert response.status_code == 200
    assert response.json()["summary"] == FIXTURES["work_report"]["zero_summary"]
    assert response.json()["next_steps"] == []


@pytest.mark.parametrize(
    "field,value",
    [
        ("total", -1),
        ("total", 1.5),
        ("total", True),
        ("completed", 6),
        ("completed", 5),
        ("scenario", "unknown"),
        ("next_todos", [{"id": "invalid", "title": "private-title"}]),
        ("next_todos", [{"id": "6c817ab8-0212-469c-aa82-624e6c7b55a1", "title": " "}]),
    ],
)
def test_invalid_work_report_is_safe(field, value):
    data = report_input()
    data[field] = value
    response = client.post("/v1/work-report", json=data)
    assert response.status_code == 422
    assert response.json() == {"code": "INVALID_INPUT", "message": "入力内容を確認してください。"}
    assert "private-title" not in response.text


def test_report_duplicate_ids_and_too_many_todos():
    data = report_input()
    data["next_todos"] *= 2
    assert client.post("/v1/work-report", json=data).status_code == 422
    data["next_todos"] *= 2
    assert client.post("/v1/work-report", json=data).status_code == 422


@pytest.mark.parametrize(
    "scenario,expected_delay,status", [("normal", 0.08, 200), ("slow", 3, 200), ("error", 3, 503)]
)
def test_report_delay_and_safe_error(monkeypatch, scenario, expected_delay, status):
    delays = []

    async def sleep(seconds):
        delays.append(seconds)

    monkeypatch.setattr("src.logic.demo.asyncio.sleep", sleep)
    response = client.post("/v1/work-report", json=report_input(scenario))
    assert response.status_code == status
    assert delays == [expected_delay]
    if status == 503:
        assert response.json() == {
            "code": "UNAVAILABLE",
            "message": "レポートを生成できませんでした。",
        }
        assert "設計を確認する" not in response.text


def test_slow_report_logic_can_be_cancelled():
    async def run():
        pending = asyncio.create_task(
            create_work_report(WorkReportInput.model_validate(report_input("slow")))
        )
        await asyncio.sleep(0.01)
        pending.cancel()
        with pytest.raises(asyncio.CancelledError):
            await pending

    asyncio.run(run())
