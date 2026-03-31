# CoCalc Architecture Documentation for Coding Agents

This directory contains machine-readable architecture documentation for coding
agents (Claude Code, Gemini CLI, etc.) working on the CoCalc codebase.

## Documents

- [overview.md](overview.md) — High-level system architecture and how components connect
- [frontend.md](frontend.md) — Frontend React app: state management, client layer, frame editors
- [conat.md](conat.md) — Conat messaging system: DKV, PubSub, and usage from frontend/project/hub
- [hub.md](hub.md) — Hub server: orchestration, database, project management
- [next.md](next.md) — Next.js app: API routes, conat bridge, Zod schema validation
- [api.md](api.md) — External API: Python client, HTTP endpoints, call flow
- [project.md](project.md) — Project daemon: services, conat integration, file operations
- [syncstrings.md](syncstrings.md) — Syncstrings: real-time collaborative editing, patches, and sync
- [database.md](database.md) — Database schema: accounts, projects, licenses, purchases, and query system
- [jupyter.md](jupyter.md) — Jupyter notebooks: kernel management, SyncDB format, execution, ipywidgets
- [frame-editors.md](frame-editors.md) — Frame editors: layout tree, editor specs, registration
- [ai-side-chat.md](ai-side-chat.md) — Embedded AI side assistant: coding agent, notebook agent, help-me-fix flow, and AI gating
- [frame-editor-dnd.md](frame-editor-dnd.md) — Frame editor drag-and-drop: split nodes, tabs, drop zones, tree ops
- [course.md](course.md) — Course management: students, assignments, handouts, grading
- [project-files.md](project-files.md) — File explorer, flyout panel, browsing paths, file actions, drag-and-drop
- [files-terminals.md](files-terminals.md) — File operations, directory listings, terminal sessions
- [auth.md](auth.md) — Authentication: cookies, SSO/OAuth, API keys, registration tokens
- [llm.md](llm.md) — LLM/AI integration: multi-provider routing, cost tracking, streaming
- [latex.md](latex.md) — LaTeX editor: build pipeline, SyncTeX, SageTeX/PythonTeX/Knitr, PDF viewer
- [frontend-components.md](frontend-components.md) — Frontend component catalog: reusable UI components in `packages/frontend/components/`

## Maintenance

> **IMPORTANT**: If you find discrepancies between the code and these
> documentation files, you **MUST** update the documentation or point this
> out to the user. The code is always authoritative — stale docs cause
> incorrect code generation by coding agents.
>
> Update the relevant file(s) whenever you:
>
> - Add a new package or module
> - Change how conat routing works
> - Modify the API layer or authentication
> - Alter the frontend state management patterns
> - Add or rename database tables or columns

Last reviewed: 2026-03-11

## What is NOT covered

- **compute**: The compute server system is not covered in this documentation.
