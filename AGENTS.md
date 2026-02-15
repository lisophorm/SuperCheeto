# Repository Guidelines

## Startup Prompt
- The canonical build brief is `docs/prompts/bootstrap.md`. Treat it as the source of truth for scope, architecture, and MVP milestones.

## Project Structure & Module Organization
- `backend/` contains the Python WebSocket service and transcription pipeline (`backend/app/`).
- `frontend/` contains the Electron + React UI (`frontend/src/` and `frontend/electron/`).
- `docs/` contains the bootstrap prompt and any additional documentation assets.

## Build, Test, and Development Commands
- `cd backend && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt` — set up backend.
- `cd backend && python -m app.main` — run the backend service.
- `cd frontend && npm install` — install frontend dependencies.
- `cd frontend && npm run dev` — run Electron + Vite in development mode.

## Coding Style & Naming Conventions
- Indentation: 4 spaces (PEP 8).
- File and module names: lowercase with underscores if needed (e.g., `data_loader.py`).
- Function and variable names: `snake_case` (e.g., `print_hi`).
- Class names: `PascalCase` (e.g., `UserProfile`).
- No formatter or linter is configured yet; if you add one (e.g., Ruff or Black), document the command here.

## Testing Guidelines
- No testing framework is configured in this repository yet.
- If tests are added, place backend tests under `backend/tests/` and frontend tests under `frontend/` as appropriate.
- Suggested command once configured: `python -m pytest` (backend).

## Documentation Roles (Agents)
- Documentation Lead: owns `README.md`, keeps build/run steps accurate, and ensures alignment with `docs/prompts/bootstrap.md`.
- Backend Docs Writer: documents `backend/` setup, audio capture prerequisites, and WebSocket message formats.
- Frontend Docs Writer: documents Electron dev workflow, UI behavior, and WebSocket client usage in `frontend/README.md`.
- Release Notes Steward: summarizes user-facing changes in PR descriptions and updates any changelog if added.

## Commit & Pull Request Guidelines
- No commit message convention is established in the current history.
- Use clear, imperative commit messages (e.g., "Add CLI entry point").
- Pull requests should include:
  - A concise summary of changes.
  - Testing notes (what you ran and results).
  - Screenshots or logs when UI/output changes are visible.

## Configuration Tips
- Target Python version is `>=3.11` (see `pyproject.toml`).
- Backend requires `OPENAI_API_KEY` in environment or `backend/.env`.
- Keep `backend/requirements.txt` and `frontend/package.json` updated when adding dependencies or tooling.
