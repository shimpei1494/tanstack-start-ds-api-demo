"""API contracts. Keep DS logic independent of HTTP and the application database."""

from ag_ui.core import RunAgentInput
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SuggestionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    goal: str = Field(min_length=1, max_length=500)

    @field_validator("goal")
    @classmethod
    def trim_goal(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("goal must contain text")
        return value


class Suggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)

    @field_validator("title", mode="before")
    @classmethod
    def trim_title(cls, value):
        return value.strip() if isinstance(value, str) else value


class SuggestionResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    suggestions: list[Suggestion] = Field(min_length=1, max_length=5)
    model_version: str = Field(min_length=1, max_length=100)


class ErrorResponse(BaseModel):
    code: str
    message: str


class ChatInput(RunAgentInput):
    """The demo supports text user/assistant history and no agent extensions."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    @model_validator(mode="before")
    @classmethod
    def message_subset(cls, value):
        if isinstance(value, dict):
            for message in value.get("messages", []):
                if isinstance(message, dict) and set(message) - {"id", "role", "content"}:
                    raise ValueError("message extensions are not supported")
        return value

    @model_validator(mode="after")
    def supported_subset(self) -> "ChatInput":
        if not self.thread_id or not self.run_id or len(self.messages) not in range(1, 101):
            raise ValueError("thread, run and 1–100 messages required")
        if self.tools or self.context or self.state != {} or self.forwarded_props != {}:
            raise ValueError("agent extensions are not supported")
        if self.parent_run_id is not None or self.resume is not None:
            raise ValueError("run resumption is not supported")
        for message in self.messages:
            if message.role not in ("user", "assistant"):
                raise ValueError("only user and assistant messages are supported")
            if not isinstance(message.content, str) or not message.content.strip():
                raise ValueError("message text required")
            message.content = message.content.strip()
            if len(message.content) > 4000 or not message.id:
                raise ValueError("invalid message")
            if getattr(message, "tool_calls", None):
                raise ValueError("tool calls are not supported")
        if self.messages[-1].role != "user":
            raise ValueError("last message must be from the user")
        return self
