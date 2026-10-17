"""Thin HTTP adapter; the DS service has no application database credentials."""

import asyncio
import logging
from collections.abc import AsyncIterator

from ag_ui.core import RunErrorEvent
from ag_ui.encoder import EventEncoder
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

from src.logic.demo import stream_chat, suggest_todos
from src.schemas.models import ChatInput, ErrorResponse, SuggestionInput, SuggestionResponse

app = FastAPI(title="Demo DS API", version="1.0.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post(
    "/v1/todo-suggestions",
    response_model=SuggestionResponse,
    responses={503: {"model": ErrorResponse}},
)
async def suggestions(input_data: SuggestionInput):
    try:
        result = await suggest_todos(input_data)
        if "[invalid]" in input_data.goal:
            return JSONResponse({"suggestions": [], "model_version": ""})
        return result
    except ValueError:
        return JSONResponse(
            {"code": "UNAVAILABLE", "message": "候補の生成に失敗しました。"}, status_code=503
        )


@app.post(
    "/v1/chat/stream",
    response_class=StreamingResponse,
    responses={
        200: {
            "description": "AG-UI basic events encoded as SSE. See the streaming contract.",
            "content": {"text/event-stream": {"schema": {"type": "string"}}},
        },
        503: {"model": ErrorResponse},
    },
)
async def chat(input_data: ChatInput, request: Request):
    text = input_data.messages[-1].content
    if "[error]" in text:
        return JSONResponse(
            {"code": "UNAVAILABLE", "message": "チャットを開始できませんでした。"}, status_code=503
        )
    encoder = EventEncoder(accept="text/event-stream")

    async def encoded() -> AsyncIterator[str]:
        source = stream_chat(input_data)
        try:
            async for event in source:
                if await request.is_disconnected():
                    return
                if "[invalid]" in text and event.type == "TEXT_MESSAGE_CONTENT":
                    yield 'data: {"type":"TEXT_MESSAGE_CONTENT","delta":4}\n\n'
                    return
                yield encoder.encode(event)
        except asyncio.CancelledError:
            # Starlette cancels the generator on disconnect, stopping pending DS awaits.
            raise
        except Exception:
            logging.getLogger(__name__).exception("DS chat generation failed")
            yield encoder.encode(
                RunErrorEvent(code="STREAM_ERROR", message="回答の生成に失敗しました。")
            )
        finally:
            await source.aclose()

    return StreamingResponse(
        encoded(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
