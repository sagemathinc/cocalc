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

## Reasoning/Thinking Tokens

**Investigation Date:** 2025-12-19

### Current Status

⚠️ **Reasoning tokens are counted but NOT captured** in the current implementation.

**Impact:**

- Token counts incomplete (missing `reasoning_tokens` field)
- User experience: users can't see reasoning token breakdown
- Billing: reasoning tokens already included in `completion_tokens` (correct)

### Provider Behavior (Verified via API Testing)

**OpenAI o3-mini** - ✅ Reasoning tokens available

- **Model:** `o3-mini` (note: `o1-mini` is deprecated)
- **Reasoning tokens:** Available in `usage_metadata.output_token_details.reasoning`
- **Test result:**
  ```json
  {
    "output_tokens": 149,
    "input_tokens": 13,
    "total_tokens": 162,
    "output_token_details": {
      "reasoning": 128
    }
  }
  ```
- **Analysis:** 86% of output tokens (128/149) are reasoning!
- **Reasoning content:** ❌ NOT exposed (internal proprietary reasoning)
- **Streaming:** Enabled for OpenAI models when requested (including o1; provider support may vary)

**xAI Grok Fast Reasoning** - ✅ Reasoning tokens available

- **Model:** `grok-4-1-fast-reasoning`
- **Reasoning tokens:** Available in `usage_metadata.output_token_details.reasoning`
- **Test result:**
  ```json
  {
    "input_tokens": 168,
    "output_tokens": 174,
    "total_tokens": 550,
    "output_token_details": {
      "reasoning": 208
    }
  }
  ```
- **Note:** `reasoning` (208) > `output` (174) - different counting methodology
- **Reasoning content:** ❌ NOT exposed
- **Streaming:** Enabled, but only text content streamed

**Gemini 2.5 & 3** - ⚠️ Complex behavior

- **Models:** `gemini-2.5-flash/pro`, `gemini-3-flash/pro-preview`
- **Token discrepancies:** 386-1033 tokens suggest internal reasoning
- **With `maxReasoningTokens`:** No reasoning field or ContentBlock.Reasoning
- **Reasoning tokens:** ❌ NOT available in `output_token_details.reasoning`
- **Conclusion:** Google includes reasoning in totals but not accessible via LangChain

**Anthropic Claude 4.5** - ❌ No reasoning mode

- Extended thinking exists but not exposed as reasoning tokens

### LangChain API Support

**UsageMetadata structure** (from `@langchain/core@1.x`):

```typescript
type UsageMetadata = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  output_token_details?: {
    text?: number;
    image?: number;
    audio?: number;
    video?: number;
    reasoning?: number; // ← Available here
  };
};
```

**ContentBlock.Reasoning type exists** but is NOT used:

```typescript
namespace ContentBlock {
  interface Reasoning extends ContentBlock {
    readonly type: "reasoning";
    reasoning: string; // Defined but never returned by providers
    index?: number;
  }
}
```

**Reality:** LangChain defines reasoning content blocks, but NO provider currently returns them. All reasoning is internal/proprietary.

### Implementation Plan

**Phase 1: Capture Reasoning Token Counts** (SIMPLE - recommended)

1. **Update ChatOutput type** (`packages/util/types/llm.ts`):

   ```typescript
   export interface ChatOutput {
     output: string;
     total_tokens: number;
     prompt_tokens: number;
     completion_tokens: number;
     reasoning_tokens?: number; // NEW
   }
   ```

2. **Extract in evaluate-lc.ts** (~line 465):

   ```typescript
   if (usage_metadata) {
     const { input_tokens, output_tokens, total_tokens, output_token_details } =
       usage_metadata;

     const reasoning_tokens = output_token_details?.reasoning;

     return {
       output,
       total_tokens,
       completion_tokens: output_tokens,
       prompt_tokens: input_tokens,
       reasoning_tokens, // NEW - undefined if not present
     };
   }
   ```

3. **Update affected code:**
   - `packages/server/llm/index.ts` - pass through `reasoning_tokens`
   - `packages/server/llm/save-response.ts` - save reasoning_tokens to DB (optional)
   - Frontend - display reasoning token breakdown in UI (optional)

**Phase 2: Frontend Display** (Optional)

```
Tokens: 162 total
  ├─ Input: 13 tokens
  ├─ Output: 149 tokens
  │   ├─ Text: ~21 tokens
  │   └─ Reasoning: 128 tokens (internal)
```

**Phase 3: Billing Transparency** (Optional)

- Add `reasoning_tokens` to purchase description for breakdown
- No pricing changes needed (already in `completion_tokens`)

### Testing

**Quick verification script:**

```bash
cat <<'EOF' | node --input-type=module
import { ChatOpenAI } from "@langchain/openai";
import { ChatXAI } from "@langchain/xai";

// Test o3-mini
const o3 = new ChatOpenAI({
  model: "o3-mini",
  apiKey: process.env.COCALC_TEST_OPENAI_KEY,
});
const result = await o3.invoke("What is 1+1?");
console.log("o3-mini reasoning tokens:", result.usage_metadata?.output_token_details?.reasoning);

// Test grok reasoning
const grok = new ChatXAI({
  model: "grok-4-1-fast-reasoning",
  apiKey: process.env.COCALC_TEST_XAI_KEY,
});
const result2 = await grok.invoke("What is 1+1?");
console.log("grok reasoning tokens:", result2.usage_metadata?.output_token_details?.reasoning);
EOF
```

**Full test script used during investigation** (run from `packages/server` directory):

```bash
cat <<'EOF' | node --input-type=module
import { ChatOpenAI } from "@langchain/openai";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatXAI } from "@langchain/xai";

console.log("=== Testing Reasoning/Thinking Tokens ===\n");

// Test 1: Gemini 2.5 with maxReasoningTokens
if (process.env.COCALC_TEST_GOOGLE_GENAI_KEY) {
  console.log("--- Test 1: Gemini 2.5 Flash with maxReasoningTokens=1024 ---");
  try {
    const gemini = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      apiKey: process.env.COCALC_TEST_GOOGLE_GENAI_KEY,
      maxReasoningTokens: 1024,
      streaming: true,
    });

    const chunks = await gemini.stream("What is 1+1? Think step by step.");

    let hasReasoning = false;
    let lastChunk = null;
    for await (const chunk of chunks) {
      lastChunk = chunk;
      const content = chunk.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "reasoning") {
            hasReasoning = true;
            console.log("✅ REASONING BLOCK FOUND");
            console.log("   Content:", block.reasoning?.substring(0, 150) + "...");
          } else if (block?.type === "text") {
            console.log("📝 TEXT BLOCK:", block.text);
          }
        }
      }
    }

    if (lastChunk?.usage_metadata) {
      console.log("\n📊 Usage Metadata:");
      console.log(JSON.stringify(lastChunk.usage_metadata, null, 2));
    }
    console.log("Has reasoning blocks:", hasReasoning ? "✅ YES" : "❌ NO");
  } catch (err) {
    console.error("❌ Gemini error:", err.message);
  }
  console.log();
}

// Test 2: OpenAI o3-mini
if (process.env.COCALC_TEST_OPENAI_KEY) {
  console.log("--- Test 2: OpenAI o3-mini (reasoning model) ---");
  try {
    const o3 = new ChatOpenAI({
      model: "o3-mini",
      apiKey: process.env.COCALC_TEST_OPENAI_KEY,
      streaming: false,
    });

    const result = await o3.invoke("What is 1+1?");
    console.log("📝 Content:", result.content);

    if (result.usage_metadata) {
      console.log("\n📊 Usage Metadata:");
      console.log(JSON.stringify(result.usage_metadata, null, 2));
    }
  } catch (err) {
    console.error("❌ OpenAI o3 error:", err.message);
  }
  console.log();
}

// Test 3: xAI Grok reasoning
if (process.env.COCALC_TEST_XAI_KEY) {
  console.log("--- Test 3: xAI Grok Fast Reasoning ---");
  try {
    const grok = new ChatXAI({
      model: "grok-4-1-fast-reasoning",
      apiKey: process.env.COCALC_TEST_XAI_KEY,
      streaming: true,
    });

    const chunks = await grok.stream("What is 1+1? Think step by step.");

    let hasReasoning = false;
    let lastChunk = null;
    for await (const chunk of chunks) {
      lastChunk = chunk;
      const content = chunk.content;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block?.type === "reasoning") {
            hasReasoning = true;
            console.log("✅ REASONING BLOCK FOUND");
            console.log("   Content:", block.reasoning?.substring(0, 150) + "...");
          } else if (block?.type === "text") {
            console.log("📝 TEXT BLOCK:", block.text);
          }
        }
      }
    }

    if (lastChunk?.usage_metadata) {
      console.log("\n📊 Usage Metadata:");
      console.log(JSON.stringify(lastChunk.usage_metadata, null, 2));
    }
    console.log("Has reasoning blocks:", hasReasoning ? "✅ YES" : "❌ NO");
  } catch (err) {
    console.error("❌ Grok error:", err.message);
  }
  console.log();
}

// Test 4: Gemini WITHOUT maxReasoningTokens (for comparison)
if (process.env.COCALC_TEST_GOOGLE_GENAI_KEY) {
  console.log("--- Test 4: Gemini 2.5 WITHOUT maxReasoningTokens ---");
  try {
    const gemini = new ChatGoogleGenerativeAI({
      model: "gemini-2.5-flash",
      apiKey: process.env.COCALC_TEST_GOOGLE_GENAI_KEY,
      streaming: false,
    });

    const result = await gemini.invoke("What is 1+1? Explain your reasoning.");

    console.log("Content type:", Array.isArray(result.content) ? "array" : typeof result.content);
    if (Array.isArray(result.content)) {
      console.log("Blocks:", result.content.map(b => b?.type).join(", "));
    } else {
      console.log("Content length:", result.content?.length, "chars");
    }

    if (result.usage_metadata) {
      console.log("\nUsage metadata:", JSON.stringify(result.usage_metadata, null, 2));
      const { input_tokens, output_tokens, total_tokens } = result.usage_metadata;
      const discrepancy = total_tokens - (input_tokens + output_tokens);
      if (discrepancy !== 0) {
        console.log(`⚠️  Token discrepancy: ${discrepancy} tokens`);
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
  console.log();
}

console.log("=== Test Complete ===");
EOF
```

**Expected output summary:**

- **Gemini 2.5 with maxReasoningTokens:** No reasoning field, output_tokens: 26
- **OpenAI o3-mini:** `reasoning: 128` tokens (86% of 149 total output tokens)
- **xAI Grok:** `reasoning: 208` tokens available
- **Gemini 2.5 without maxReasoningTokens:** Token discrepancy of 1033 tokens (hidden reasoning)

### Key Findings Summary

1. ✅ **Reasoning token counts ARE available** via `usage_metadata.output_token_details.reasoning`
2. ❌ **Reasoning content is NOT available** - all providers keep it internal
3. ✅ **Billing already correct** - reasoning tokens included in `completion_tokens`
4. 📊 **High reasoning ratios** - o3-mini uses 86% reasoning tokens (128/149)
5. 🔄 **Simple fix** - just extract and return `reasoning_tokens` field

### References

- [LangChain.js UsageMetadata](https://v03.api.js.langchain.com/types/_langchain_core.messages.UsageMetadata.html)
- [GitHub Issue: Include Reasoning Tokens in Cost Calculation](https://github.com/langchain-ai/langchain/issues/29779)
- Test file: `packages/server/llm/test/models.test.ts` (line 42 acknowledges thinking tokens)
