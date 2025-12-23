import createPurchase from "@cocalc/server/purchases/create-purchase";
import { callback2 } from "@cocalc/util/async-utils";
import { OTHER_SETTINGS_USER_DEFINED_LLM } from "@cocalc/util/db-schema/defaults";
import {
  LanguageModel,
  USER_SELECTABLE_LLMS_BY_VENDOR,
} from "@cocalc/util/db-schema/llm-utils";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";

import { evaluate as evaluateLLM } from "..";
import { getCustomOpenAI } from "../client";
import { evaluateWithLangChain } from "../evaluate-lc";
import { evaluateOllama } from "../ollama";

jest.mock("@cocalc/database/settings/server-settings", () => ({
  getServerSettings: jest.fn(async () => ({
    default_llm: "gpt-4o-8k",
    kucalc: KUCALC_COCALC_COM,
    pay_as_you_go_openai_markup_percentage: 0,
    google_vertexai_enabled: true,
    google_vertexai_key: "fake-google",
    mistral_enabled: true,
    mistral_api_key: "fake-mistral",
    anthropic_enabled: true,
    anthropic_api_key: "fake-anthropic",
    openai_enabled: true,
    openai_api_key: "fake-openai",
    xai_enabled: true,
    xai_api_key: "fake-xai",
    custom_openai_enabled: true,
    custom_openai_configuration: {},
  })),
}));

jest.mock("@cocalc/database/settings", () => ({
  getServerSettings: jest.fn(async () => ({
    user_defined_llm: true,
  })),
}));

jest.mock("@cocalc/database", () => ({
  db: jest.fn(() => ({
    get_account: jest.fn(),
  })),
}));

jest.mock("@cocalc/util/async-utils", () => ({
  callback2: jest.fn(async () => ({})),
}));

jest.mock("../abuse", () => ({
  checkForAbuse: jest.fn(async () => {}),
}));

jest.mock("../save-response", () => ({
  saveResponse: jest.fn(async () => {}),
}));

jest.mock("../evaluate-lc", () => ({
  evaluateWithLangChain: jest.fn(async () => ({
    output: "2",
    total_tokens: 2,
    prompt_tokens: 1,
    completion_tokens: 1,
  })),
}));

jest.mock("../client", () => ({
  getCustomOpenAI: jest.fn(async () => ({})),
}));

jest.mock("../ollama", () => ({
  evaluateOllama: jest.fn(async () => ({
    output: "2",
    total_tokens: 2,
    prompt_tokens: 1,
    completion_tokens: 1,
  })),
}));

jest.mock("@cocalc/server/purchases/create-purchase", () => ({
  __esModule: true,
  default: jest.fn(async () => {}),
}));

const mockEvaluateWithLangChain = evaluateWithLangChain as jest.MockedFunction<
  typeof evaluateWithLangChain
>;
const mockGetCustomOpenAI = getCustomOpenAI as jest.MockedFunction<
  typeof getCustomOpenAI
>;
const mockCallback2 = callback2 as jest.MockedFunction<typeof callback2>;
const mockEvaluateOllama = evaluateOllama as jest.MockedFunction<
  typeof evaluateOllama
>;
const mockCreatePurchase = createPurchase as jest.MockedFunction<
  typeof createPurchase
>;

describe("LLM evaluation (mocked LangChain)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const userAccountId = "123e4567-e89b-12d3-a456-426614174000";
  const userModel = "user-openai-gpt-4o-8k" as LanguageModel;
  const userConfig = [
    {
      id: 1,
      service: "openai",
      model: "gpt-4o-8k",
      display: "Test GPT-4o 8k",
      endpoint: "https://api.openai.com/v1",
      apiKey: "user-openai-key",
    },
  ];

  const mockUserConfig = () => {
    mockCallback2.mockResolvedValueOnce({
      other_settings: {
        [OTHER_SETTINGS_USER_DEFINED_LLM]: JSON.stringify(userConfig),
      },
    });
  };

  const lcModels: LanguageModel[] = Object.values(
    USER_SELECTABLE_LLMS_BY_VENDOR,
  ).flat() as LanguageModel[];

  test.each(lcModels)(
    "routes via evaluateWithLangChain for %s",
    async (model) => {
      const output = await evaluateLLM({ input: "1+1", model });
      expect(output).toBe("2");
      expect(mockEvaluateWithLangChain).toHaveBeenCalledWith(
        expect.objectContaining({ input: "1+1", model }),
      );
    },
  );

  test("routes Ollama models via evaluateOllama", async () => {
    const ollamaModel = "ollama-llama3" as LanguageModel;
    const output = await evaluateLLM({ input: "1+1", model: ollamaModel });
    expect(output).toBe("2");
    expect(mockEvaluateOllama).toHaveBeenCalledWith(
      expect.objectContaining({ input: "1+1", model: ollamaModel }),
    );
  });

  test("user-defined models call evaluateWithLangChain", async () => {
    mockUserConfig();

    const output = await evaluateLLM({
      input: "1+1",
      model: userModel,
      account_id: userAccountId,
    });
    expect(output).toBe("2");
    expect(mockEvaluateWithLangChain).toHaveBeenCalledWith(
      expect.objectContaining({
        input: "1+1",
        model: "gpt-4o-8k",
        apiKey: "user-openai-key",
        endpoint: "https://api.openai.com/v1",
        service: "openai",
      }),
      "user",
    );
  });

  test("routes custom OpenAI models via evaluateWithLangChain", async () => {
    const model = "custom_openai-omni4high" as LanguageModel;
    const output = await evaluateLLM({ input: "1+1", model });
    expect(output).toBe("2");
    expect(mockEvaluateWithLangChain).toHaveBeenCalledWith(
      expect.objectContaining({ input: "1+1", model }),
    );
  });

  test("platform custom OpenAI models use getCustomOpenAI", async () => {
    const { PROVIDER_CONFIGS } = jest.requireActual(
      "../evaluate-lc",
    ) as typeof import("../evaluate-lc");
    const model = "custom_openai-omni4high" as LanguageModel;

    await PROVIDER_CONFIGS["custom-openai"].createClient(
      { model } as any,
      {} as any,
      "cocalc",
    );

    expect(mockGetCustomOpenAI).toHaveBeenCalledWith("omni4high");
  });

  test("charges platform models", async () => {
    const model = "gpt-4o-8k" as LanguageModel;
    await evaluateLLM({
      input: "1+1",
      model,
      account_id: "acct-1",
    });
    expect(mockCreatePurchase).toHaveBeenCalled();
  });

  test("does not charge user-defined models", async () => {
    mockUserConfig();
    await evaluateLLM({
      input: "1+1",
      model: userModel,
      account_id: userAccountId,
    });
    expect(mockCreatePurchase).not.toHaveBeenCalled();
  });

  test("does not charge custom OpenAI models", async () => {
    const model = "custom_openai-omni4high" as LanguageModel;
    await evaluateLLM({
      input: "1+1",
      model,
      account_id: "acct-1",
    });
    expect(mockCreatePurchase).not.toHaveBeenCalled();
  });
});
