import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import {
  LanguageModel,
  USER_SELECTABLE_LLMS_BY_VENDOR,
} from "@cocalc/util/db-schema/llm-utils";
import { evaluate as evaluateLLM } from "..";
import { evaluateWithLangChain } from "../evaluate-lc";
import { evaluateOllama } from "../ollama";
import { evaluateUserDefinedLLM } from "../user-defined";

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
  })),
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

jest.mock("../ollama", () => ({
  evaluateOllama: jest.fn(async () => ({
    output: "2",
    total_tokens: 2,
    prompt_tokens: 1,
    completion_tokens: 1,
  })),
}));

jest.mock("../user-defined", () => ({
  evaluateUserDefinedLLM: jest.fn(async () => ({
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
const mockEvaluateOllama = evaluateOllama as jest.MockedFunction<
  typeof evaluateOllama
>;
const mockEvaluateUserDefinedLLM =
  evaluateUserDefinedLLM as jest.MockedFunction<typeof evaluateUserDefinedLLM>;

describe("LLM evaluation (mocked LangChain)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  test("routes user-defined models via evaluateUserDefinedLLM", async () => {
    const userModel = "user-openai-gpt-4o-8k" as LanguageModel;
    const output = await evaluateLLM({
      input: "1+1",
      model: userModel,
      account_id: "test-account",
    });
    expect(output).toBe("2");
    expect(mockEvaluateUserDefinedLLM).toHaveBeenCalledWith(
      expect.objectContaining({ input: "1+1", model: userModel }),
      "test-account",
    );
  });
});
