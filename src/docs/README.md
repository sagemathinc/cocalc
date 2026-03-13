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
- [frame-editor-dnd.md](frame-editor-dnd.md) — Frame editor drag-and-drop: split nodes, tabs, drop zones, tree ops
- [course.md](course.md) — Course management: students, assignments, handouts, grading
- [project-files.md](project-files.md) — File explorer, flyout panel, browsing paths, file actions, drag-and-drop
- [files-terminals.md](files-terminals.md) — File operations, directory listings, terminal sessions
- [auth.md](auth.md) — Authentication: cookies, SSO/OAuth, API keys, registration tokens
- [llm.md](llm.md) — LLM/AI integration: multi-provider routing, cost tracking, streaming
- [latex.md](latex.md) — LaTeX editor: build pipeline, SyncTeX, SageTeX/PythonTeX/Knitr, PDF viewer

## Maintenance

> **IMPORTANT**: Feel free to update the documentation. In particular:
>
> - If you add a new package
> - Notice a difference between code and docs -- code is authoritative
> - Change how conat routing works
> - Modify the API layer
> - Alter the frontend state management patterns
>
> Update the relevant file(s) here.
> These docs are consumed by coding agents and stale information might cause
> incorrect code generation.

Last reviewed: 2026-03-11

## What is NOT covered

- **compute**: The compute server system is not covered in this documentation.
