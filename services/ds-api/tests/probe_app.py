"""Test-process-only instrumentation around the production chat generator.

Run from services/ds-api with:
  uv run uvicorn probe_app:app --app-dir tests --host 127.0.0.1 --port 8101

The regular src.api.app:app entrypoint never imports this module and exposes none
of these probe endpoints. The stream, HTTP handler and cancellation path remain
the production implementations.
"""

import asyncio
import importlib
import time
from collections.abc import AsyncIterator
from typing import Any

from ag_ui.core import BaseEvent

from src.schemas.models import ChatInput

api_module = importlib.import_module("src.api.app")
original_stream_chat = api_module.stream_chat
runs: dict[str, dict[str, Any]] = {}


async def tracked_stream_chat(input_data: ChatInput) -> AsyncIterator[BaseEvent]:
    run: dict[str, Any] = {
        "runId": input_data.run_id,
        "threadId": input_data.thread_id,
        "text": input_data.messages[-1].content,
        "events": [],
        "startedAtMs": time.time() * 1000,
        "finishedAtMs": None,
        "completed": False,
        "cancelled": False,
    }
    runs[input_data.run_id] = run
    source = original_stream_chat(input_data)
    try:
        async for event in source:
            event_type = event.model_dump(mode="json")["type"]
            run["events"].append(event_type)
            if event_type == "RUN_FINISHED":
                run["completed"] = True
            yield event
    except asyncio.CancelledError:
        run["cancelled"] = True
        raise
    finally:
        # Mark finalized only after the real generator has been closed.
        await source.aclose()
        run["finishedAtMs"] = time.time() * 1000


api_module.stream_chat = tracked_stream_chat
app = api_module.app


@app.get("/__test/runs", include_in_schema=False)
async def observed_runs(marker: str = "") -> dict[str, list[dict[str, Any]]]:
    return {"runs": [run for run in runs.values() if marker in run["text"]]}
