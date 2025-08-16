// import { log } from "console";

import {
  AnthropicModel,
  LanguageModelCore,
  // GoogleModel,
  MistralModel,
  isAnthropicModel,
  isGoogleModel,
  isMistralModel,
  isOpenAIModel,
  UserDefinedLLM,
  toUserLLMModelName,
} from "@cocalc/util/db-schema/llm-utils";
import { evaluateGoogleGenAI } from "..";
import { evaluateAnthropic } from "../anthropic";
import { getClient } from "../client";
import createAccount from "../../accounts/create-account";
import { db } from "@cocalc/database";
import { callback2 } from "@cocalc/util/async-utils";
import { OTHER_SETTINGS_USERDEFINED_LLM } from "@cocalc/util/db-schema/defaults";
import { uuid } from "@cocalc/util/misc";
import { evaluateWithLangChain } from "../evaluate-lc";
import { GoogleGenAIClient } from "../google-genai-client";
import { USE_NEWER_LC_IMPL } from "../index";
import { evaluateMistral } from "../mistral";
import { evaluateOpenAILC } from "../openai-lc";
import { evaluateUserDefinedLLM } from "../user-defined";
import { enableModels, setupAPIKeys, test_llm } from "./shared";
import { before, after, getPool } from "@cocalc/server/test";

// sometimes (flaky case) they take more than 10s to even start a response
const LLM_TIMEOUT = 15_000;

beforeAll(async () => {
  await before({ noConat: true });
  await setupAPIKeys();
  await enableModels();
}, 15000);

afterAll(after);

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

  const answer = USE_NEWER_LC_IMPL
    ? await evaluateWithLangChain({
        model,
        ...QUERY,
      })
    : await evaluateOpenAILC({
        model,
        ...QUERY,
      });

  checkAnswer(answer);
}

async function llmGoogle(model: LanguageModelCore) {
  if (!isGoogleModel(model)) {
    throw new Error(`model: ${model} is not a Google model`);
  }

  const answer = USE_NEWER_LC_IMPL
    ? await evaluateWithLangChain({
        model,
        ...QUERY,
      })
    : await (async () => {
        const client = (await getClient(model)) as GoogleGenAIClient;
        return await evaluateGoogleGenAI({
          model,
          client,
          ...QUERY,
        });
      })();

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

  test("gpt-5 works", async () => {
    await llmOpenAI("gpt-5-8k");
  });

  test("gpt-5-mini works", async () => {
    await llmOpenAI("gpt-5-mini-8k");
  });
});

test_llm("google")("Google GenAI", () => {
  test(
    "gemini 1.5 pro works",
    async () => {
      await llmGoogle("gemini-1.5-pro");
    },
    LLM_TIMEOUT,
  );
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
      const answer = USE_NEWER_LC_IMPL
        ? await evaluateWithLangChain({ model: medium, ...QUERY })
        : await evaluateMistral({ model: medium, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "large",
    async () => {
      const answer = USE_NEWER_LC_IMPL
        ? await evaluateWithLangChain({ model: large, ...QUERY })
        : await evaluateMistral({ model: large, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "devstral",
    async () => {
      const answer = USE_NEWER_LC_IMPL
        ? await evaluateWithLangChain({ model: devstral, ...QUERY })
        : await evaluateMistral({ model: devstral, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  // test(
  //   "magistral",
  //   async () => {
  //     const answer = USE_NEWER_LC_IMPL
  //       ? await evaluateWithLangChain({ model: magistral, ...QUERY })
  //       : await evaluateMistral({ model: magistral, ...QUERY });
  //     checkAnswer(answer);
  //   },
  //   LLM_TIMEOUT,
  // );
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
      const answer = USE_NEWER_LC_IMPL
        ? await evaluateWithLangChain({ model: haiku, ...QUERY })
        : await evaluateAnthropic({ model: haiku, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "sonnet",
    async () => {
      const answer = USE_NEWER_LC_IMPL
        ? await evaluateWithLangChain({ model: sonnet, ...QUERY })
        : await evaluateAnthropic({ model: sonnet, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );

  test(
    "opus",
    async () => {
      const answer = USE_NEWER_LC_IMPL
        ? await evaluateWithLangChain({ model: opus, ...QUERY })
        : await evaluateAnthropic({ model: opus, ...QUERY });
      checkAnswer(answer);
    },
    LLM_TIMEOUT,
  );
});

// User-defined LLM tests
describe("User-defined LLMs", () => {
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
  test(
    "user-defined OpenAI model works",
    async () => {
      const openaiKey = process.env.COCALC_TEST_OPENAI_KEY;
      if (!openaiKey) {
        console.log("Skipping user-defined OpenAI test - no API key");
        return;
      }

      const config: UserDefinedLLM = {
        id: 1,
        service: "openai",
        display: "Test GPT-4o Mini",
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: openaiKey,
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
  test(
    "user-defined Google model works",
    async () => {
      const googleKey = process.env.COCALC_TEST_GOOGLE_GENAI_KEY;
      if (!googleKey) {
        console.log("Skipping user-defined Google test - no API key");
        return;
      }

      const config: UserDefinedLLM = {
        id: 2,
        service: "google",
        display: "Test Gemini Flash",
        endpoint: "",
        model: "gemini-1.5-flash",
        apiKey: googleKey,
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
  test(
    "user-defined Anthropic model works",
    async () => {
      const anthropicKey = process.env.COCALC_TEST_ANTHROPIC_KEY;
      if (!anthropicKey) {
        console.log("Skipping user-defined Anthropic test - no API key");
        return;
      }

      const config: UserDefinedLLM = {
        id: 3,
        service: "anthropic",
        display: "claude-3-5-haiku-latest",
        endpoint: "",
        model: "claude-3-5-haiku-latest",
        apiKey: anthropicKey,
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
  test(
    "user-defined Mistral model works",
    async () => {
      const mistralKey = process.env.COCALC_TEST_MISTRAL_AI_KEY;
      if (!mistralKey) {
        console.log("Skipping user-defined Mistral test - no API key");
        return;
      }

      const config: UserDefinedLLM = {
        id: 4,
        service: "mistralai",
        display: "Test Mistral Small",
        endpoint: "",
        model: "mistral-small-latest",
        apiKey: mistralKey,
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
  test(
    "user-defined custom OpenAI model works",
    async () => {
      const openaiKey = process.env.COCALC_TEST_OPENAI_KEY;
      if (!openaiKey) {
        console.log("Skipping user-defined custom OpenAI test - no API key");
        return;
      }

      const config: UserDefinedLLM = {
        id: 5,
        service: "custom_openai",
        display: "Test Custom GPT-4o",
        endpoint: "https://api.openai.com/v1",
        model: "gpt-4o",
        apiKey: openaiKey,
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
