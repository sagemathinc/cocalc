// import { log } from "console";

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import {
  AnthropicModel,
  LanguageModelCore,
  // GoogleModel,
  MistralModel,
  isAnthropicModel,
  isGoogleModel,
  isMistralModel,
  isOpenAIModel,
} from "@cocalc/util/db-schema/llm-utils";
// import { evaluateMistral } from "../mistral";
import { evaluateAnthropic } from "../anthropic";
import { GoogleGenAIClient } from "../google-genai-client";
import { evaluateMistral } from "../mistral";
import { evaluateOpenAILC } from "../openai-lc";
import { enableModels, setupAPIKeys, test_llm } from "./shared";
import { evaluateGoogleGenAI } from "..";
import { getClient } from "../client";

const LLM_TIMEOUT = 10_000;

beforeAll(async () => {
  await initEphemeralDatabase();
  await setupAPIKeys();
  await enableModels();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

const QUERY = {
  input: "What's 99 + 1?",
  system: "Reply only the value.",
} as const;

function checkAnswer(answer) {
  const { output, total_tokens, completion_tokens, prompt_tokens } = answer;
  expect(output).toContain("100");
  // total tokens is more than that sume for "thinking" models like gemini 2.5
  // because thinking tokens are not part of this
  expect(total_tokens).toBeGreaterThanOrEqual(
    prompt_tokens + completion_tokens,
  );
  expect(prompt_tokens).toBeGreaterThan(5);
  expect(completion_tokens).toBeGreaterThan(0);
}

async function llmOpenAI(model: LanguageModelCore) {
  if (!isOpenAIModel(model)) {
    throw new Error(`model: ${model} is not an OpenAI model`);
  }

  const answer = await evaluateOpenAILC({
    model,
    ...QUERY,
  });

  checkAnswer(answer);
}

async function llmGoogle(model: LanguageModelCore) {
  if (!isGoogleModel(model)) {
    throw new Error(`model: ${model} is not a Google model`);
  }
  const client = (await getClient(model)) as GoogleGenAIClient;
  const answer = await evaluateGoogleGenAI({
    model,
    client,
    ...QUERY,
  });
  checkAnswer(answer);
}

// write a test in jest that fails
test_llm("openai")("OpenAI", () => {
  test(
    "gpt3.5 works",
    async () => {
      llmOpenAI("gpt-3.5-turbo");
    },
    LLM_TIMEOUT,
  );
  test(
    "gpt 4 works",
    async () => {
      llmOpenAI("gpt-4");
    },
    LLM_TIMEOUT,
  );
  test(
    "gpt 4 turbo works",
    async () => {
      llmOpenAI("gpt-4-turbo-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gpt 4 omni works",
    async () => {
      llmOpenAI("gpt-4o-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gpt 4o mini works",
    async () => {
      llmOpenAI("gpt-4o-mini-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gpt 4.1 works",
    async () => {
      llmOpenAI("gpt-4.1");
    },
    LLM_TIMEOUT,
  );
  test(
    "gpt 4.1 mini works",
    async () => {
      llmOpenAI("gpt-4.1-mini");
    },
    LLM_TIMEOUT,
  );

  // test("gpt o1", async () => {
  //   llmOpenAI("o1-8k");
  // });
  // test("gpt o1 mini works", async () => {
  //   llmOpenAI("o1-mini-8k");
  // });
});

// ATTN: does not work everywhere around, geolocation matters
test_llm("google")("Google GenAI", () => {
  test(
    "gemini 1.5 pro works",
    async () => {
      llmGoogle("gemini-1.5-pro");
    },
    LLM_TIMEOUT,
  );
  test(
    "gemini 2.0 flash works",
    async () => {
      llmGoogle("gemini-2.0-flash-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gemini 2.0 flash lite works",
    async () => {
      llmGoogle("gemini-2.0-flash-lite-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gemini 2.5 flash works",
    async () => {
      llmGoogle("gemini-2.5-flash-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gemini 2.5 pro works",
    async () => {
      llmGoogle("gemini-2.5-pro-8k");
    },
    LLM_TIMEOUT,
  );
});

test_llm("mistralai")("Mistral AI", () => {
  const small: MistralModel = "mistral-small-latest";
  const medium: MistralModel = "mistral-medium-latest";
  const large: MistralModel = "mistral-large-latest";

  test("model", () => {
    expect(isMistralModel(small)).toBe(true);
    expect(isMistralModel(medium)).toBe(true);
    expect(isMistralModel(large)).toBe(true);
  });

  test(
    "small",
    async () => {
      const answer = await evaluateMistral({ model: small, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "medium",
    async () => {
      const answer = await evaluateMistral({ model: medium, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "large",
    async () => {
      const answer = await evaluateMistral({ model: large, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );
});

test_llm("anthropic")("Anthropic", () => {
  const haiku: AnthropicModel = "claude-3-5-haiku-8k";
  const sonnet: AnthropicModel = "claude-4-sonnet-8k";
  const opus: AnthropicModel = "claude-4-opus-8k";

  test("model", () => {
    expect(isAnthropicModel(haiku)).toBe(true);
    expect(isAnthropicModel(sonnet)).toBe(true);
    expect(isAnthropicModel(opus)).toBe(true);
  });

  test(
    "haiku",
    async () => {
      const answer = await evaluateAnthropic({ model: haiku, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "sonnet",
    async () => {
      const answer = await evaluateAnthropic({ model: sonnet, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "opus",
    async () => {
      const answer = await evaluateAnthropic({ model: opus, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );
});
