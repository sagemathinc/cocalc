# Server LLM Integration (LangChain) — Development Status

**Started:** 2025-12-18

## Status (High Level)

- ✅ Legacy non-LangChain code removed (feature flag + direct SDK paths)
- ✅ LangChain dependencies updated in `packages/server`
- ✅ New models added: Gemini 3 Flash (free), xAI Grok (free), OpenAI GPT-5.2
- 🟡 Test coverage: integration tests exist (opt-in), more unit coverage still possible

## Key Decisions / Conventions

- **Single implementation path:** supported core models go through `packages/server/llm/evaluate-lc.ts`.
- **Gemini 3 Flash naming:** provider ID includes `preview`, but user-facing name/description must not.
- **xAI pricing:** Grok models are marked `free: true` (cheap enough to offer without metering).
- **GPT-5 deprecation:** GPT-5 (`gpt-5`, `gpt-5-8k`) is no longer user-selectable; GPT-5.2 is the replacement. (GPT-5 Mini 8k remains available since there is no GPT-5.2 Mini.)
- **Faster models at 16k:** Gemini 3 Flash and both Grok Fast models are offered with a 16k context limit.
- **Node version:** `.nvmrc` is `20` (LangChain 1.x requirement).

## Model Registry Changes

**Gemini (Google GenAI)**

- Internal key: `gemini-3-flash-preview-16k`
- Provider model id: `gemini-3-flash-preview` (via `GOOGLE_MODEL_TO_ID`)
- User-facing: `"Gemini 3 Flash"` (no “Preview” in `LLM_USERNAMES`/`LLM_DESCR`)
  - Context limit: 16k (`gemini-3-flash-preview-16k`)

**xAI**

- Models: `grok-4-1-fast-non-reasoning-16k`, `grok-code-fast-1-16k`
- Settings: `xai_enabled`, `xai_api_key`
- LangChain: `@langchain/xai` (`ChatXAI`, streaming enabled)
  - Grok Fast context limit: 16k

**OpenAI**

- Added: `gpt-5.2-8k`, `gpt-5.2`
- Normalization updated so `gpt-5.2-*` does not get treated as `gpt-5`.

## Tests / Validation

**Fast checks**

- `cd packages/util && pnpm build`
- `cd packages/server && pnpm build`

**Unit tests**

- `cd packages/util && pnpm test db-schema/llm-utils.test.ts`

**Integration tests (requires Postgres + keys)**

The suite is opt-in and skipped unless `COCALC_TEST_LLM=true`.

- `cd packages/server && COCALC_TEST_LLM=true pnpm test llm/test/models.test.ts`
- Keys/env used by tests (see `packages/server/llm/test/shared.ts`):
  - `COCALC_TEST_OPENAI_KEY`
  - `COCALC_TEST_GOOGLE_GENAI_KEY`
  - `COCALC_TEST_ANTHROPIC_KEY`
  - `COCALC_TEST_MISTRAL_AI_KEY`
  - `COCALC_TEST_XAI_KEY`

## Next Steps (Suggested)

- Add unit tests for provider selection + normalization in `packages/server/llm/evaluate-lc.ts` (mock LangChain clients).
- Run a full monorepo build once (`pnpm build-dev`) to ensure no stale package outputs.
- Frontend follow-up: improve/standardize the xAI avatar by converting the Wikimedia SVG into the same parametric style used in `packages/frontend/components/ai-avatar.tsx` (current URL basis: `https://upload.wikimedia.org/wikipedia/commons/9/93/XAI_Logo.svg`).
