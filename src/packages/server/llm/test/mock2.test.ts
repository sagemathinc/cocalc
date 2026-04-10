import { callback2 } from "@cocalc/util/async-utils";
import { OTHER_SETTINGS_USER_DEFINED_LLM } from "@cocalc/util/db-schema/defaults";

import { evaluateWithAI } from "../evaluate";
import { evaluateUserDefinedLLM } from "../user-defined";

// Shared state for tracking provider calls - must be module-level for jest.mock hoisting
const trackers = {
  openai: undefined as any,
  anthropic: undefined as any,
  google: undefined as any,
  mistral: undefined as any,
  xai: undefined as any,
  lastModelId: undefined as string | undefined,
};

let mockGenerateResult = {
  text: "ok",
  usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
};
let streamChunks: string[] = [];

function makeFactory(key: keyof typeof trackers) {
  return (args: any) => {
    (trackers as any)[key] = args;
    return (modelId: string, _settings?: any) => {
      trackers.lastModelId = modelId;
      return { modelId, _provider: "mock" };
    };
  };
}

jest.mock("@ai-sdk/openai", () => ({
  createOpenAI: makeFactory("openai"),
}));

jest.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: makeFactory("anthropic"),
}));

jest.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: makeFactory("google"),
}));

jest.mock("@ai-sdk/mistral", () => ({
  createMistral: makeFactory("mistral"),
}));

jest.mock("@ai-sdk/xai", () => ({
  createXai: makeFactory("xai"),
}));

jest.mock("ai", () => ({
  generateText: jest.fn(async () => mockGenerateResult),
  streamText: jest.fn(() => ({
    textStream: (async function* () {
      for (const chunk of streamChunks) {
        yield chunk;
      }
    })(),
    usage: Promise.resolve(mockGenerateResult.usage),
    text: Promise.resolve(streamChunks.join("")),
  })),
}));

jest.mock("@cocalc/database/settings/server-settings", () => ({
  getServerSettings: jest.fn(async () => ({
    openai_enabled: true,
    openai_api_key: "server-openai-key",
    google_vertexai_enabled: true,
    google_vertexai_key: "server-google-key",
    mistral_enabled: true,
    mistral_api_key: "server-mistral-key",
    anthropic_enabled: true,
    anthropic_api_key: "server-anthropic-key",
    xai_enabled: true,
    xai_api_key: "server-xai-key",
    zai_enabled: true,
    zai_api_key: "server-zai-key",
    custom_openai_enabled: true,
    custom_openai_configuration: {},
    user_defined_llm: true,
    ollama_configuration: {
      llama3: {
        baseUrl: "http://localhost:11434",
        model: "llama3",
      },
    },
  })),
}));

jest.mock("../abuse", () => ({
  checkForAbuse: jest.fn(async () => {}),
}));

jest.mock("../save-response", () => ({
  saveResponse: jest.fn(async () => {}),
}));

// evaluate.ts imports from @cocalc/database/settings (not /server-settings)
// so this mock must include the full settings as well
jest.mock("@cocalc/database/settings", () => ({
  getServerSettings: jest.fn(async () => ({
    openai_enabled: true,
    openai_api_key: "server-openai-key",
    google_vertexai_enabled: true,
    google_vertexai_key: "server-google-key",
    mistral_enabled: true,
    mistral_api_key: "server-mistral-key",
    anthropic_enabled: true,
    anthropic_api_key: "server-anthropic-key",
    xai_enabled: true,
    xai_api_key: "server-xai-key",
    zai_enabled: true,
    zai_api_key: "server-zai-key",
    custom_openai_enabled: true,
    custom_openai_configuration: {},
    user_defined_llm: true,
    ollama_configuration: {
      llama3: {
        baseUrl: "http://localhost:11434",
        model: "llama3",
      },
    },
  })),
}));

jest.mock("../chat-history", () => ({
  transformHistoryToMessages: jest.fn(() => ({
    messages: [],
    tokens: 0,
  })),
}));

var mockGetCustomOpenAIModel: jest.Mock;

jest.mock("../client", () => ({
  getCustomOpenAIModel: (mockGetCustomOpenAIModel = jest.fn(async () => ({
    model: { modelId: "custom", _provider: "mock" },
  }))),
  getOllamaModel: jest.fn(async () => ({
    model: { modelId: "ollama", _provider: "mock" },
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

describe("evaluateWithAI (AI SDK mocked)", () => {
  const mockCallback2 = callback2 as jest.MockedFunction<typeof callback2>;
  const userAccountId = "123e4567-e89b-12d3-a456-426614174000";
  const userConfig = [
    {
      id: 1,
      service: "openai",
      model: "gpt-4o-8k",
      display: "User GPT-4o 8k",
      endpoint: "https://api.openai.com/v1",
      apiKey: "user-openai-key",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    trackers.lastModelId = undefined;
    trackers.openai = undefined;
    trackers.anthropic = undefined;
    trackers.google = undefined;
    trackers.mistral = undefined;
    trackers.xai = undefined;
    streamChunks = [];
    mockGenerateResult = {
      text: "ok",
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
  });

  test("OpenAI uses normalized model and server key", async () => {
    const output = await evaluateWithAI({
      input: "hi",
      model: "gpt-4.1",
    });

    expect(output.output).toBe("ok");
    expect(trackers.openai).toMatchObject({
      apiKey: "server-openai-key",
    });
    expect(trackers.lastModelId).toBe("gpt-4.1");
  });

  test("Google uses mapped model name", async () => {
    await evaluateWithAI({
      input: "hi",
      model: "gemini-2.5-flash-8k",
    });

    expect(trackers.google).toMatchObject({
      apiKey: "server-google-key",
    });
    expect(trackers.lastModelId).toBe("gemini-2.5-flash");
  });

  test("Anthropic uses version alias", async () => {
    await evaluateWithAI({
      input: "hi",
      model: "claude-4-5-sonnet-8k",
    });

    expect(trackers.anthropic).toMatchObject({
      apiKey: "server-anthropic-key",
    });
    expect(trackers.lastModelId).toBe("claude-sonnet-4-5");
  });

  test("Mistral passes model through", async () => {
    await evaluateWithAI({
      input: "hi",
      model: "mistral-medium-latest",
    });

    expect(trackers.mistral).toMatchObject({
      apiKey: "server-mistral-key",
    });
    expect(trackers.lastModelId).toBe("mistral-medium-latest");
  });

  test("xAI maps 16k model to provider name", async () => {
    await evaluateWithAI({
      input: "hi",
      model: "grok-4-1-fast-non-reasoning-16k",
    });

    expect(trackers.xai).toMatchObject({
      apiKey: "server-xai-key",
    });
    expect(trackers.lastModelId).toBe("grok-4-1-fast-non-reasoning");
  });

  test("custom OpenAI platform mode uses getCustomOpenAIModel", async () => {
    await evaluateWithAI({
      input: "hi",
      model: "custom_openai-omni4high",
    });

    expect(mockGetCustomOpenAIModel).toHaveBeenCalledWith("omni4high");
  });

  test("custom OpenAI user mode passes endpoint and api key", async () => {
    await evaluateWithAI(
      {
        input: "hi",
        model: "gpt-4o",
        apiKey: "user-openai-key",
        endpoint: "https://example.com/v1",
        service: "custom_openai",
      },
      "user",
    );

    expect(trackers.openai).toMatchObject({
      apiKey: "user-openai-key",
      baseURL: "https://example.com/v1",
      compatibility: "compatible",
    });
    expect(trackers.lastModelId).toBe("gpt-4o");
  });

  test("user-defined models use raw model and user key", async () => {
    mockCallback2.mockResolvedValueOnce({
      other_settings: {
        [OTHER_SETTINGS_USER_DEFINED_LLM]: JSON.stringify(userConfig),
      },
    });

    await evaluateUserDefinedLLM(
      {
        input: "hi",
        model: "user-openai-gpt-4o-8k",
      },
      userAccountId,
    );

    expect(trackers.openai).toMatchObject({
      apiKey: "user-openai-key",
      baseURL: "https://api.openai.com/v1",
    });
    expect(trackers.lastModelId).toBe("gpt-4o-8k");
  });

  test("user-defined Ollama uses OpenAI-compatible endpoint", async () => {
    const ollamaConfig = [
      {
        id: 1,
        service: "ollama",
        model: "llama3",
        display: "User Llama3",
        endpoint: "http://localhost:11434",
        apiKey: "",
        max_tokens: 32000,
      },
    ];

    mockCallback2.mockResolvedValueOnce({
      other_settings: {
        [OTHER_SETTINGS_USER_DEFINED_LLM]: JSON.stringify(ollamaConfig),
      },
    });

    await evaluateUserDefinedLLM(
      {
        input: "hello",
        model: "user-ollama-llama3",
      },
      userAccountId,
    );

    expect(trackers.openai).toMatchObject({
      apiKey: "ollama",
      baseURL: "http://localhost:11434/v1",
      compatibility: "compatible",
    });
    expect(trackers.lastModelId).toBe("llama3");
  });

  test("user-defined Google passes correct config", async () => {
    const googleConfig = [
      {
        id: 1,
        service: "google",
        model: "gemini-2.5-flash",
        display: "User Gemini Flash",
        endpoint: "",
        apiKey: "user-google-key",
        max_tokens: 128000,
      },
    ];

    mockCallback2.mockResolvedValueOnce({
      other_settings: {
        [OTHER_SETTINGS_USER_DEFINED_LLM]: JSON.stringify(googleConfig),
      },
    });

    await evaluateUserDefinedLLM(
      {
        input: "hi",
        model: "user-google-gemini-2.5-flash",
      },
      userAccountId,
    );

    expect(trackers.google).toMatchObject({
      apiKey: "user-google-key",
    });
    expect(trackers.lastModelId).toBe("gemini-2.5-flash");
  });

  test("streaming works with token accumulation", async () => {
    streamChunks = ["hi", " there"];
    const streamFn = jest.fn();

    const output = await evaluateWithAI({
      input: "hello",
      model: "gpt-4o-8k",
      stream: streamFn,
    });

    expect(output.output).toBe("hi there");
    expect(streamFn).toHaveBeenCalledWith("hi");
    expect(streamFn).toHaveBeenCalledWith(" there");
    expect(streamFn).toHaveBeenCalledWith(null);
  });

  test("returns token counts from API usage", async () => {
    mockGenerateResult = {
      text: "result",
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    };

    const output = await evaluateWithAI({
      input: "hi",
      model: "gpt-4o-8k",
    });

    expect(output.prompt_tokens).toBe(100);
    expect(output.completion_tokens).toBe(50);
    expect(output.total_tokens).toBe(150);
  });
});
