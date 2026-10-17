"""DS-owned functions. Replace these rules with tested inference or retrieval here."""

import asyncio
import json
from collections.abc import AsyncIterator
from pathlib import Path
from uuid import uuid4

from ag_ui.core import (
    BaseEvent,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    StepFinishedEvent,
    StepStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
)

from src.schemas.models import ChatInput, SuggestionInput, SuggestionResponse

_FIXTURE_PATH = Path(__file__).resolve().parents[4] / "packages/ds-contract/fixtures/scenarios.json"
FIXTURES = json.loads(_FIXTURE_PATH.read_text())


async def suggest_todos(input_data: SuggestionInput) -> SuggestionResponse:
    await asyncio.sleep(5 if "[slow]" in input_data.goal else 0.08)
    if "[error]" in input_data.goal:
        raise ValueError("demo service failure")
    prefix = input_data.goal[:160]
    return SuggestionResponse(
        suggestions=[
            {"title": f"{prefix}：{suffix}"} for suffix in FIXTURES["suggestion_suffixes"]
        ],
        model_version=FIXTURES["model_version"],
    )


async def stream_chat(input_data: ChatInput) -> AsyncIterator[BaseEvent]:
    text = input_data.messages[-1].content
    message_id = str(uuid4())
    yield RunStartedEvent(thread_id=input_data.thread_id, run_id=input_data.run_id)
    yield StepStartedEvent(step_name="retrieve")
    await asyncio.sleep(5 if "[slow]" in text else 0.08)
    yield StepFinishedEvent(step_name="retrieve")
    yield StepStartedEvent(step_name="generate")
    yield TextMessageStartEvent(message_id=message_id, role="assistant")
    for index, delta in enumerate(FIXTURES["chat_deltas"]):
        await asyncio.sleep(0.08)
        yield TextMessageContentEvent(message_id=message_id, delta=delta)
        if index == 0 and "[stream-error]" in text:
            yield RunErrorEvent(code="STREAM_ERROR", message="回答の生成に失敗しました。")
            return
        if index == 0 and "[disconnect]" in text:
            return
    yield TextMessageEndEvent(message_id=message_id)
    yield StepFinishedEvent(step_name="generate")
    yield RunFinishedEvent(thread_id=input_data.thread_id, run_id=input_data.run_id)
