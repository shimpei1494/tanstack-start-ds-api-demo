FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.9.4 /uv /uvx /bin/
WORKDIR /app/services/ds-api
COPY services/ds-api/pyproject.toml services/ds-api/uv.lock ./
RUN uv sync --frozen --no-dev
COPY services/ds-api/src ./src
COPY packages/ds-contract/fixtures /app/packages/ds-contract/fixtures
EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "src.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
