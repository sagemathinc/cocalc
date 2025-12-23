// import { log } from "console";

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import {
  toCustomOpenAIModel,
  UserDefinedLLM,
  toUserLLMModelName,
  USER_SELECTABLE_LLMS_BY_VENDOR,
} from "@cocalc/util/db-schema/llm-utils";
import createAccount from "@cocalc/server/accounts/create-account";
import { db } from "@cocalc/database";
import { callback2 } from "@cocalc/util/async-utils";
import { OTHER_SETTINGS_USER_DEFINED_LLM } from "@cocalc/util/db-schema/defaults";
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

function testSelectableModels(
  service: "openai" | "google" | "mistralai" | "anthropic" | "xai",
  label: string,
) {
  const models = USER_SELECTABLE_LLMS_BY_VENDOR[service];
  test_llm(service)(label, () => {
    for (const model of models) {
      test(
        `${model} works`,
        async () => {
          const answer = await evaluateWithLangChain({ model, ...QUERY });
          checkAnswer(answer);
        },
        LLM_TIMEOUT,
      );
    }
  });
}

testSelectableModels("openai", "OpenAI");
testSelectableModels("google", "Google GenAI");
testSelectableModels("mistralai", "Mistral AI");
testSelectableModels("anthropic", "Anthropic");
testSelectableModels("xai", "xAI");

test_llm("openai")("Custom OpenAI Endpoints", () => {
  test(
    "custom OpenAI endpoint works (requires COCALC_TEST_OPENAI_KEY)",
    async () => {
      const customOpenAIConfig = {
        omni4high: {
          baseUrl: "https://api.openai.com/v1",
          temperature: 1.5,
          openAIApiKey: process.env.COCALC_TEST_OPENAI_KEY!,
          model: "gpt-4o",
          cocalc: {
            icon: "https://upload.wikimedia.org/wikipedia/commons/8/88/Mini-Robot.png",
            display: "High GPT-4 Omni",
            desc: "GPT 4 Omni with a high temperature",
          },
        },
      };

      await callback2(db().set_server_setting, {
        name: "custom_openai_enabled",
        value: "yes",
        readonly: true,
      });
      await callback2(db().set_server_setting, {
        name: "custom_openai_configuration",
        value: JSON.stringify(customOpenAIConfig),
        readonly: true,
      });

      const answer = await evaluateWithLangChain({
        model: toCustomOpenAIModel("omni4high"),
        ...QUERY,
      });

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
        '{${OTHER_SETTINGS_USER_DEFINED_LLM}}',
        to_jsonb($1::text)
      ) WHERE account_id = $2`,
      [userDefinedLLMJson, account_id],
    );
  }

  let nextId = 1;

  async function testUserDefinedLLM(
    config: Omit<UserDefinedLLM, "id">,
  ): Promise<void> {
    const fullConfig: UserDefinedLLM = { ...config, id: nextId++ };
    await createUserDefinedLLMConfig([fullConfig]);

    const userModel = toUserLLMModelName(fullConfig);
    const answer = await evaluateUserDefinedLLM(
      {
        model: userModel,
        ...QUERY,
      },
      account_id,
    );

    checkAnswer(answer);
  }

  // Test user-defined OpenAI model
  test_llm_case("openai")(
    "user-defined OpenAI model works (requires COCALC_TEST_OPENAI_KEY)",
    async () => {
      await testUserDefinedLLM({
        service: "openai",
        display: "Test GPT-4o Mini",
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: process.env.COCALC_TEST_OPENAI_KEY!,
      });
    },
    LLM_TIMEOUT,
  );

  // Test user-defined Google model
  test_llm_case("google")(
    "user-defined Google model works (requires COCALC_TEST_GOOGLE_GENAI_KEY)",
    async () => {
      await testUserDefinedLLM({
        service: "google",
        display: "Test Gemini Flash",
        endpoint: "",
        model: "gemini-2.5-flash",
        apiKey: process.env.COCALC_TEST_GOOGLE_GENAI_KEY!,
      });
    },
    LLM_TIMEOUT,
  );

  // Test user-defined Anthropic model
  test_llm_case("anthropic")(
    "user-defined Anthropic model works (requires COCALC_TEST_ANTHROPIC_KEY)",
    async () => {
      await testUserDefinedLLM({
        service: "anthropic",
        display: "claude-3-5-haiku-latest",
        endpoint: "",
        model: "claude-3-5-haiku-latest",
        apiKey: process.env.COCALC_TEST_ANTHROPIC_KEY!,
      });
    },
    LLM_TIMEOUT,
  );

  // Test user-defined Mistral model
  test_llm_case("mistralai")(
    "user-defined Mistral model works (requires COCALC_TEST_MISTRAL_AI_KEY)",
    async () => {
      await testUserDefinedLLM({
        service: "mistralai",
        display: "Test Mistral Small",
        endpoint: "",
        model: "mistral-small-latest",
        apiKey: process.env.COCALC_TEST_MISTRAL_AI_KEY!,
      });
    },
    LLM_TIMEOUT,
  );

  // Test user-defined custom OpenAI model
  test_llm_case("openai")(
    "user-defined custom OpenAI model works (requires COCALC_TEST_OPENAI_KEY)",
    async () => {
      await testUserDefinedLLM({
        service: "custom_openai",
        display: "Test Custom GPT-4o",
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4o",
        apiKey: process.env.COCALC_TEST_OPENAI_KEY!,
      });
    },
    LLM_TIMEOUT,
  );

  // Test user-defined xAI model
  test_llm_case("xai")(
    "user-defined xAI model works (requires COCALC_TEST_XAI_KEY)",
    async () => {
      await testUserDefinedLLM({
        service: "xai",
        display: "Test Grok 4.1 Fast",
        endpoint: "",
        model: "grok-4-1-fast-non-reasoning",
        apiKey: process.env.COCALC_TEST_XAI_KEY!,
      });
    },
    LLM_TIMEOUT,
  );

  // Test user-defined model with custom max_tokens
  test_llm_case("google")(
    "user-defined model with custom max_tokens (requires COCALC_TEST_GOOGLE_GENAI_KEY)",
    async () => {
      await testUserDefinedLLM({
        service: "google",
        display: "Test Gemini Flash with custom max_tokens",
        endpoint: "",
        model: "gemini-2.5-flash",
        apiKey: process.env.COCALC_TEST_GOOGLE_GENAI_KEY!,
        max_tokens: 128000, // Custom large context window
      });
    },
    LLM_TIMEOUT,
  );
});
