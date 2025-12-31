This directory contains the lite-side implementation of Codex ACP (Agent Control Protocol). It wires the Codex agent to CoCalc’s messaging fabric, persists streamed events, and mirrors them into the chat syncdb so the frontend sees live progress and the final turn result.

Key pieces:

- `index.ts` boots the ACP server for lite mode, starts or reuses the codex-acp agent, and streams results into chat via `ChatStreamWriter`.
- Events are published over conat pub/sub for live viewing and also persisted into AKV for replay; interrupts are handled through the same channel.
- The code is designed so we can later add unit tests and split out multiuser-specific wiring while keeping the shared ACP logic together.
