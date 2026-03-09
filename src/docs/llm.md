# LLM / AI Integration

This document explains how CoCalc integrates large language models — provider
routing, cost tracking, streaming, the Conat messaging bridge, and frontend
components.

## Overview

CoCalc supports multiple LLM providers through a unified architecture:

- **Server** (`packages/server/llm/`): evaluation engine, provider routing via
  LangChain, abuse prevention, cost tracking
- **Conat bridge** (`packages/conat/llm/`): request/response messaging with
  streaming between frontend and server
- **Frontend** (`packages/frontend/frame-editors/llm/`,
  `packages/frontend/client/llm.ts`): model selector, inline assistant, cost
  estimation
- **Types & config** (`packages/util/db-schema/llm-utils.ts`,
  `packages/util/types/llm.ts`): model definitions, pricing, validation

```
┌───────────────┐       ┌───────────────┐
│   Frontend     │       │  REST API      │
│  LLMClient     │       │  /api/v2/llm   │
└───────┬───────┘       └───────┬───────┘
        │ Conat multiresponse   │ HTTP
        └───────────┬───────────┘
                    │
            ┌───────▼────────┐
            │  Server LLM     │
            │  evaluate()     │
            └───────┬────────┘
                    │ LangChain
        ┌───────────┼───────────┐
        │           │           │
   ┌────▼───┐  ┌───▼───┐  ┌───▼────┐
   │ OpenAI  │  │Google │  │Anthropic│  ...
   └─────────┘  └───────┘  └────────┘
```

## Supported Providers

```typescript
// packages/util/db-schema/llm-utils.ts
const SERVICES = [
  "openai",
  "google",
  "mistralai",
  "anthropic",
  "ollama",
  "custom_openai",
  "xai",
] as const;
```

| Provider      | Model prefix     | Examples                                           |
| ------------- | ---------------- | -------------------------------------------------- |
| OpenAI        | `gpt-`           | `gpt-4o`, `gpt-4-turbo`, `gpt-4o-mini`             |
| Google        | `gemini-`        | `gemini-2-flash-preview-16k`, `gemini-1.5-pro-001` |
| Anthropic     | `claude-`        | `claude-3-5-sonnet`, `claude-3-opus`               |
| Mistral       | `mistral-`       | `mistral-large`, `mistral-small`                   |
| Xai           | `grok-`          | `grok-2`, `grok-3`                                 |
| Ollama        | `ollama-`        | User-configured local models                       |
| Custom OpenAI | `custom_openai-` | User-configured endpoints                          |
| User-defined  | `user-`          | `user-{service}-{id}`                              |

**Default priority** when auto-selecting: Google → OpenAI → Anthropic →
Mistral → Xai → Ollama → Custom OpenAI.

## Server-Side Evaluation

### Entry Point

`packages/server/llm/index.ts` — the main `evaluate()` function:

```typescript
async function evaluate(opts: ChatOptions): Promise<string> {
  // 1. Validate model
  // 2. Check for abuse (rate limits)
  // 3. Route to provider:
  //    - User-defined → evaluateUserDefinedLLM()
  //    - Ollama → evaluateOllama()
  //    - All others → evaluateWithLangChain()
  // 4. Save response to database
  // 5. Create purchase record (for non-free models)
}
```

### LangChain Unified Handler

`packages/server/llm/evaluate-lc.ts` — routes OpenAI, Google, Anthropic,
Mistral, Xai, and Custom OpenAI through LangChain:

```typescript
const PROVIDER_CONFIGS = {
  openai:    { createClient: () => new ChatOpenAI(...) },
  google:    { createClient: () => new ChatGoogleGenerativeAI(...) },
  anthropic: { createClient: () => new ChatAnthropic(...) },
  mistralai: { createClient: () => new ChatMistralAI(...) },
  xai:       { createClient: () => new ChatOpenAI({ baseURL: xai_endpoint }) },
  // ...
};
```

Each provider config includes:

- `createClient()` — instantiate LangChain chat model
- `checkEnabled()` — verify API key is configured
- `canonicalModel()` — normalize model name
- `getTokenCountFallback()` — estimate tokens when API doesn't return counts

### Streaming

Streaming uses Conat **multiresponse** requests:

1. Frontend sends request to `llm.account-{account_id}.api`
2. Server sends chunks with incrementing sequence numbers
3. Frontend reassembles via `stream` callback: `(output: string | null) => void`
4. `null` signals completion

### Ollama

`packages/server/llm/ollama.ts` — for locally hosted models:

```typescript
async function evaluateOllama(opts): Promise<ChatOutput> {
  // Uses LangChain Ollama client
  // Supports custom endpoints for user-defined models
  // Token counting via approximate heuristic
}
```

### User-Defined LLMs

`packages/server/llm/user-defined.ts` — models configured by individual users:

```typescript
async function evaluateUserDefinedLLM(opts, account_id) {
  // 1. Parse model name: "user-{service}-{id}"
  // 2. Fetch config from accounts.other_settings["userdefined_llm"]
  // 3. Route to appropriate evaluator with user's API key
}
```

## Core Types

### ChatOptions

```typescript
// packages/util/types/llm.ts
interface ChatOptions {
  input: string; // user message
  system?: string; // system prompt
  history?: History; // conversation history
  model?: LanguageModel; // model identifier
  account_id?: string;
  project_id?: string;
  path?: string; // file context
  tag?: string; // analytics tag
  maxTokens?: number;
  timeout?: number;
  stream?: (output: string | null) => void;
}

type History = {
  role: "assistant" | "user" | "system";
  content: string;
}[];
```

### ChatOutput

```typescript
interface ChatOutput {
  output: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
}
```

## Cost Tracking

### Pricing

`packages/util/db-schema/llm-utils.ts` defines per-model pricing:

```typescript
const LLM_COST: { [name in LanguageModelCore]: Cost } = {
  "gpt-4": { prompt_tokens: /* USD per 1M */, completion_tokens: /* ... */ },
  "claude-3-5-sonnet": { ... },
  // ...
};

function getLLMCost(model, markup_percentage): {
  prompt_tokens: number;      // USD per token with markup
  completion_tokens: number;  // USD per token with markup
}
```

### Purchase Flow

After evaluation:

1. Check `isFreeModel(model)` — free models skip charging
2. Calculate cost:
   `prompt_cost * prompt_tokens + completion_cost * completion_tokens`
3. Create purchase via `createPurchase()` with type, token counts, tag

### Free Models

Determined by `isFreeModel(model, isCoCalcCom)`:

- Ollama models (self-hosted)
- Some user-defined LLMs
- Platform-specific free tiers

## Abuse Prevention

`packages/server/llm/abuse.ts`:

```typescript
// Configurable via environment variables:
COCALC_LLM_QUOTA_NO_ACCOUNT; // default: 0 (disabled)
COCALC_LLM_QUOTA_ACCOUNT; // default: 100,000 tokens
COCALC_LLM_QUOTA_GLOBAL; // default: 1,000,000 tokens
```

Prometheus metrics: `llm_abuse_usage_global_pct` (gauge),
`llm_abuse_usage_account_pct` (histogram), `llm_abuse_rejected_total`
(counter).

## Database Schema

### `openai_chatgpt_log` Table

Despite the legacy name, stores **all** LLM provider interactions:

| Field           | Type        | Description                           |
| --------------- | ----------- | ------------------------------------- |
| `id`            | `serial`    | Primary key                           |
| `time`          | `timestamp` | Request time                          |
| `account_id`    | `UUID`      | Requesting user                       |
| `input`         | `text`      | User message                          |
| `output`        | `text`      | Model response                        |
| `history`       | `jsonb`     | Conversation history                  |
| `model`         | `text`      | Model identifier                      |
| `system`        | `text`      | System prompt                         |
| `tag`           | `text`      | Analytics tag (`{vendor}:{category}`) |
| `total_tokens`  | `integer`   | Total tokens used                     |
| `prompt_tokens` | `integer`   | Input tokens                          |
| `total_time_s`  | `float`     | Response time                         |
| `project_id`    | `UUID`      | Context project                       |
| `path`          | `text`      | Context file path                     |

### Related Tables

- **`openai_embedding_log`** — vector embedding usage tracking
- **`openai_embedding_cache`** — embedding cache (keyed by `input_sha1`)

## Conat Messaging

### Subject Pattern

```typescript
// packages/conat/llm/server.ts
llm.account - { account_id }.api; // user requests
llm.project - { project_id }.api; // project requests
llm.hub.api; // hub-level requests
```

### Server Registration

```typescript
// packages/server/conat/llm.ts
export async function init() {
  await init0(evaluate); // subscribes to llm.*.api subjects
}
```

### Client

```typescript
// packages/conat/llm/client.ts
export async function llm(options: ChatOptions): Promise<string> {
  // Sends multiresponse request to llmSubject
  // Handles streaming via options.stream callback
  // Returns concatenated output
}
```

## Frontend Components

### LLMClient

`packages/frontend/client/llm.ts`:

```typescript
class LLMClient {
  async query(opts: QueryLLMProps): Promise<string>; // one-shot query
  queryStream(opts): ChatStream; // streaming query
}
```

Handles: default system prompt, locale settings, purchase permission checks,
history/message truncation to fit context window, Conat call.

### Model Selector

`packages/frontend/frame-editors/llm/llm-selector.tsx` — dropdown for choosing
model. Groups models by provider, shows inline cost estimation, includes
user-defined LLMs, validates availability.

### AI Assistant Integration Points

**Frame editors** (`packages/frontend/frame-editors/llm/`):

| Component                  | Purpose                          |
| -------------------------- | -------------------------------- |
| `llm-assistant-button.tsx` | Main AI button in editor toolbar |
| `help-me-fix-button.tsx`   | Error explanation button         |
| `help-me-fix-dialog.tsx`   | Full dialog for fix suggestions  |
| `llm-query-dropdown.tsx`   | Quick action menu                |
| `llm-history-selector.tsx` | Previous query history           |

**Jupyter** (`packages/frontend/jupyter/llm/`):

| Component                   | Purpose                      |
| --------------------------- | ---------------------------- |
| `cell-tool.tsx`             | Per-cell AI assistant button |
| `cell-context-selector.tsx` | Choose context scope         |
| `split-cells.ts`            | LLM-powered cell splitting   |

**Chat** (`packages/frontend/chat/`):

- `llm-cost-estimation.tsx` — cost display in chat messages
- Message summarization via LLM

### Token Estimation

`packages/frontend/misc/llm.ts`:

```typescript
numTokensEstimate(content: string): number          // ~8 chars/token heuristic
truncateMessage(content: string, maxTokens): string  // truncate to fit
truncateHistory(history, maxTokens, model): History   // remove oldest entries
```

### Cost Estimation Component

`packages/frontend/misc/llm-cost-estimation.tsx` — displays estimated cost
before execution. Free models marked as "free to use".

## User-Defined LLMs

Users can add their own LLM endpoints:

```typescript
// packages/util/db-schema/llm-utils.ts
interface UserDefinedLLM {
  id: number;
  service: UserDefinedLLMService; // "openai", "anthropic", etc.
  model: string; // model name at provider
  display: string; // display name
  endpoint: string; // API endpoint URL
  apiKey: string; // API key
  icon?: string;
  max_tokens?: number;
}

// Stored in: accounts.other_settings["userdefined_llm"] as JSON array
// Model name format: "user-{service}-{id}"
const USER_LLM_PREFIX = "user-";
```

### User-Defined LLM Hook (Frontend)

```typescript
// packages/frontend/frame-editors/llm/use-userdefined-llm.ts
function useUserDefinedLLM(): UserDefinedLLM[];
function getUserDefinedLLMByModel(model: string): UserDefinedLLM | null;
```

## REST API

```
POST /api/v2/llm/evaluate
  Body: { input, system?, history?, model?, tag? }
  Response: { output, success } | { error }
```

## Server Settings

| Setting                                  | Description                                            |
| ---------------------------------------- | ------------------------------------------------------ |
| `default_llm`                            | Default model (fallback: `gemini-3-flash-preview-16k`) |
| `pay_as_you_go_openai_markup_percentage` | Cost markup (0-100%)                                   |
| `user_defined_llm`                       | Enable/disable user-defined LLM support                |

## Key Source Files

| File                                                           | Description                                    |
| -------------------------------------------------------------- | ---------------------------------------------- |
| `packages/util/db-schema/llm-utils.ts`                         | Model definitions, pricing, validation (~66KB) |
| `packages/util/types/llm.ts`                                   | ChatOptions, History, ChatOutput types         |
| `packages/util/db-schema/llm.ts`                               | Database schema for log tables                 |
| `packages/server/llm/index.ts`                                 | Main evaluate() entry point                    |
| `packages/server/llm/evaluate-lc.ts`                           | LangChain unified handler                      |
| `packages/server/llm/ollama.ts`                                | Ollama provider                                |
| `packages/server/llm/user-defined.ts`                          | User-defined LLM evaluation                    |
| `packages/server/llm/abuse.ts`                                 | Rate limiting and quotas                       |
| `packages/server/llm/save-response.ts`                         | Database persistence                           |
| `packages/conat/llm/client.ts`                                 | Frontend → server messaging                    |
| `packages/conat/llm/server.ts`                                 | Subject routing and handling                   |
| `packages/frontend/client/llm.ts`                              | LLMClient class                                |
| `packages/frontend/frame-editors/llm/llm-selector.tsx`         | Model picker                                   |
| `packages/frontend/frame-editors/llm/llm-assistant-button.tsx` | AI button                                      |
| `packages/frontend/jupyter/llm/cell-tool.tsx`                  | Jupyter cell assistant                         |
| `packages/frontend/misc/llm-cost-estimation.tsx`               | Cost display                                   |
| `packages/frontend/misc/llm.ts`                                | Token estimation utilities                     |
| `packages/next/pages/api/v2/llm/evaluate.ts`                   | REST API endpoint                              |

## Common Patterns for Agents

### Making an LLM Query (Frontend)

```typescript
const result = await webapp_client.llm_client.query({
  input: "Explain this error",
  system: "You are a helpful coding assistant",
  model: "gpt-4o",
  project_id: "...",
  path: "file.py",
  tag: "editor:help-me-fix",
});
```

### Streaming Response (Frontend)

```typescript
const chatStream = webapp_client.llm_client.queryStream({
  input: "Write a function...",
  model: "claude-3-5-sonnet",
  tag: "jupyter:cell-tool",
});
chatStream.on("token", (token) => {
  /* update UI */
});
chatStream.on("done", (fullOutput) => {
  /* final result */
});
```

### Checking Model Availability

```typescript
import {
  isLanguageModelValid,
  isFreeModel,
  getLLMCost,
} from "@cocalc/util/db-schema/llm-utils";

if (isLanguageModelValid(model)) {
  const free = isFreeModel(model, isCoCalcCom);
  const cost = getLLMCost(model, markup_percentage);
}
```
