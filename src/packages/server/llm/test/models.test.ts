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
  isXaiModel,
  UserDefinedLLM,
  toUserLLMModelName,
} from "@cocalc/util/db-schema/llm-utils";
import createAccount from "@cocalc/server/accounts/create-account";
import { db } from "@cocalc/database";
import { callback2 } from "@cocalc/util/async-utils";
import { OTHER_SETTINGS_USERDEFINED_LLM } from "@cocalc/util/db-schema/defaults";
import { uuid } from "@cocalc/util/misc";
import { evaluateWithLangChain } from "../evaluate-lc";
import { evaluateUserDefinedLLM } from "../user-defined";
import { enableModels, setupAPIKeys, test_llm, test_llm_case } from "./shared";

// sometimes (flaky case) they take more than 10s to even start a response
const LLM_TIMEOUT = 15_000;

beforeAll(async () => {
  if (process.env.COCALC_TEST_LLM !== "true") return;
  await initEphemeralDatabase();
  await setupAPIKeys();
  await enableModels();
}, 15000);

afterAll(async () => {
  if (process.env.COCALC_TEST_LLM !== "true") return;
  await getPool().end();
});

const QUERY = {
  input: "What's 99 + 1?",
  system: "Reply only the value.",
} as const;

function checkAnswer(answer) {
  const { output, total_tokens, completion_tokens, prompt_tokens } = answer;
  expect(output).toContain("100");
  // For "thinking" models like gemini 2.5, total tokens can be more than sum due to thinking tokens
  // For some Google models, total tokens can be less than sum due to different tokenization
  // So we just check that all token counts are reasonable numbers
  expect(total_tokens).toBeGreaterThan(0);
  expect(prompt_tokens).toBeGreaterThan(5);
  expect(completion_tokens).toBeGreaterThan(0);
}

async function llmOpenAI(model: LanguageModelCore) {
  if (!isOpenAIModel(model)) {
    throw new Error(`model: ${model} is not an OpenAI model`);
  }

  const answer = await evaluateWithLangChain({
    model,
    ...QUERY,
  });

  checkAnswer(answer);
}

async function llmGoogle(model: LanguageModelCore) {
  if (!isGoogleModel(model)) {
    throw new Error(`model: ${model} is not a Google model`);
  }

  const answer = await evaluateWithLangChain({
    model,
    ...QUERY,
  });

  checkAnswer(answer);
}

async function llmXai(model: LanguageModelCore) {
  if (!isXaiModel(model)) {
    throw new Error(`model: ${model} is not an xAI model`);
  }

  const answer = await evaluateWithLangChain({
    model,
    ...QUERY,
  });

  checkAnswer(answer);
}

// write a test in jest that fails
test_llm("openai")("OpenAI", () => {
  test(
    "gpt3.5 works",
    async () => {
      await llmOpenAI("gpt-3.5-turbo");
    },
    LLM_TIMEOUT,
  );
  test(
    "gpt 4 works",
    async () => {
      await llmOpenAI("gpt-4");
    },
    LLM_TIMEOUT,
  );
  test(
    "gpt 4 turbo works",
    async () => {
      await llmOpenAI("gpt-4-turbo-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gpt 4 omni works",
    async () => {
      await llmOpenAI("gpt-4o-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gpt 4o mini works",
    async () => {
      await llmOpenAI("gpt-4o-mini-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gpt 4.1 works",
    async () => {
      await llmOpenAI("gpt-4.1");
    },
    LLM_TIMEOUT,
  );
  test(
    "4.1 mini works",
    async () => {
      await llmOpenAI("gpt-4.1-mini");
    },
    LLM_TIMEOUT,
  );

  test("o3 works", async () => {
    await llmOpenAI("o3-8k");
  });

  test("o4-mini works", async () => {
    await llmOpenAI("o4-mini-8k");
  });

  test("gpt-5.2 works", async () => {
    await llmOpenAI("gpt-5.2-8k");
  });

  test("gpt-5-mini works", async () => {
    await llmOpenAI("gpt-5-mini-8k");
  });

  // GPT-5 is intentionally not user-selectable anymore (GPT-5.2 replaces it).
});

test_llm("google")("Google GenAI", () => {
  test(
    "gemini 2.0 flash works",
    async () => {
      await llmGoogle("gemini-2.0-flash-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gemini 2.0 flash lite works",
    async () => {
      await llmGoogle("gemini-2.0-flash-lite-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gemini 2.5 flash works",
    async () => {
      await llmGoogle("gemini-2.5-flash-8k");
    },
    LLM_TIMEOUT,
  );
  test(
    "gemini 2.5 pro works",
    async () => {
      await llmGoogle("gemini-2.5-pro-8k");
    },
    LLM_TIMEOUT,
  );

  test(
    "gemini 3 flash works",
    async () => {
      await llmGoogle("gemini-3-flash-preview-16k");
    },
    LLM_TIMEOUT,
  );
});

test_llm("xai")("xAI", () => {
  test(
    "grok 4.1 fast works",
    async () => {
      await llmXai("grok-4-1-fast-non-reasoning-16k");
    },
    LLM_TIMEOUT,
  );

  test(
    "grok code fast works",
    async () => {
      await llmXai("grok-code-fast-1-16k");
    },
    LLM_TIMEOUT,
  );
});

test_llm("mistralai")("Mistral AI", () => {
  const medium: MistralModel = "mistral-medium-latest";
  const large: MistralModel = "mistral-large-latest";
  const devstral: MistralModel = "devstral-medium-2507";
  //const magistral: MistralModel = "magistral-medium-latest";

  test("model", () => {
    expect(isMistralModel(medium)).toBe(true);
    expect(isMistralModel(large)).toBe(true);
    expect(isMistralModel(devstral)).toBe(true);
    //expect(isMistralModel(magistral)).toBe(true);
  });

  test(
    "medium",
    async () => {
      const answer = await evaluateWithLangChain({
        model: medium,
        ...QUERY,
      });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "large",
    async () => {
      const answer = await evaluateWithLangChain({ model: large, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "devstral",
    async () => {
      const answer = await evaluateWithLangChain({
        model: devstral,
        ...QUERY,
      });
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
      const answer = await evaluateWithLangChain({ model: haiku, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "sonnet",
    async () => {
      const answer = await evaluateWithLangChain({ model: sonnet, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "opus",
    async () => {
      const answer = await evaluateWithLangChain({ model: opus, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );
});

// User-defined LLM tests
test_llm("user")("User-defined LLMs", () => {
  const account_id = uuid();
  let accountCreated = false;

  beforeAll(async () => {
    // Create test account only once for the entire describe block
    if (!accountCreated) {
      await createAccount({
        email: `test-${account_id}@example.com`,
        password: "testpass123",
        firstName: "Test",
        lastName: "User",
        account_id,
      });
      accountCreated = true;
    }

    // Enable user-defined LLMs server setting
    await callback2(db().set_server_setting, {
      name: "user_defined_llm",
      value: "yes",
      readonly: true,
    });
  });

  async function createUserDefinedLLMConfig(configs: UserDefinedLLM[]) {
    const userDefinedLLMJson = JSON.stringify(configs);
    const pool = getPool();
    await pool.query(
      `UPDATE accounts SET other_settings = jsonb_set(
        COALESCE(other_settings, '{}'::jsonb),
        '{${OTHER_SETTINGS_USERDEFINED_LLM}}',
        to_jsonb($1::text)
      ) WHERE account_id = $2`,
      [userDefinedLLMJson, account_id],
    );
  }

  // Test user-defined OpenAI model
  test_llm_case("openai")(
    "user-defined OpenAI model works (requires COCALC_TEST_OPENAI_KEY)",
    async () => {
      const config: UserDefinedLLM = {
        id: 1,
        service: "openai",
        display: "Test GPT-4o Mini",
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: process.env.COCALC_TEST_OPENAI_KEY!,
      };

      await createUserDefinedLLMConfig([config]);

      const userModel = toUserLLMModelName(config);
      const answer = await evaluateUserDefinedLLM(
        {
          model: userModel,
          ...QUERY,
        },
        account_id,
      );

      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  // Test user-defined Google model
  test_llm_case("google")(
    "user-defined Google model works (requires COCALC_TEST_GOOGLE_GENAI_KEY)",
    async () => {
      const config: UserDefinedLLM = {
        id: 2,
        service: "google",
        display: "Test Gemini Flash",
        endpoint: "",
        model: "gemini-2.5-flash",
        apiKey: process.env.COCALC_TEST_GOOGLE_GENAI_KEY!,
      };

      await createUserDefinedLLMConfig([config]);

      const userModel = toUserLLMModelName(config);
      const answer = await evaluateUserDefinedLLM(
        {
          model: userModel,
          ...QUERY,
        },
        account_id,
      );

      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  // Test user-defined Anthropic model
  test_llm_case("anthropic")(
    "user-defined Anthropic model works (requires COCALC_TEST_ANTHROPIC_KEY)",
    async () => {
      const config: UserDefinedLLM = {
        id: 3,
        service: "anthropic",
        display: "claude-3-5-haiku-latest",
        endpoint: "",
        model: "claude-3-5-haiku-latest",
        apiKey: process.env.COCALC_TEST_ANTHROPIC_KEY!,
      };

      await createUserDefinedLLMConfig([config]);

      const userModel = toUserLLMModelName(config);
      const answer = await evaluateUserDefinedLLM(
        {
          model: userModel,
          ...QUERY,
        },
        account_id,
      );

      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  // Test user-defined Mistral model
  test_llm_case("mistralai")(
    "user-defined Mistral model works (requires COCALC_TEST_MISTRAL_AI_KEY)",
    async () => {
      const config: UserDefinedLLM = {
        id: 4,
        service: "mistralai",
        display: "Test Mistral Small",
        endpoint: "",
        model: "mistral-small-latest",
        apiKey: process.env.COCALC_TEST_MISTRAL_AI_KEY!,
      };

      await createUserDefinedLLMConfig([config]);

      const userModel = toUserLLMModelName(config);
      const answer = await evaluateUserDefinedLLM(
        {
          model: userModel,
          ...QUERY,
        },
        account_id,
      );

      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  // Test user-defined custom OpenAI model
  test_llm_case("openai")(
    "user-defined custom OpenAI model works (requires COCALC_TEST_OPENAI_KEY)",
    async () => {
      const config: UserDefinedLLM = {
        id: 5,
        service: "custom_openai",
        display: "Test Custom GPT-4o",
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4o",
        apiKey: process.env.COCALC_TEST_OPENAI_KEY!,
      };

      await createUserDefinedLLMConfig([config]);

      const userModel = toUserLLMModelName(config);
      const answer = await evaluateUserDefinedLLM(
        {
          model: userModel,
          ...QUERY,
        },
        account_id,
      );

      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  // Test user-defined xAI model
  test_llm_case("xai")(
    "user-defined xAI model works (requires COCALC_TEST_XAI_KEY)",
    async () => {
      const config: UserDefinedLLM = {
        id: 6,
        service: "xai",
        display: "Test Grok 4.1 Fast",
        endpoint: "",
        model: "grok-4-1-fast-non-reasoning-16k",
        apiKey: process.env.COCALC_TEST_XAI_KEY!,
      };

      await createUserDefinedLLMConfig([config]);

      const userModel = toUserLLMModelName(config);
      const answer = await evaluateUserDefinedLLM(
        {
          model: userModel,
          ...QUERY,
        },
        account_id,
      );

      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );
});
