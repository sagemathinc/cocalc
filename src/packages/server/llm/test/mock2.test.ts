import { callback2 } from "@cocalc/util/async-utils";
import { OTHER_SETTINGS_USER_DEFINED_LLM } from "@cocalc/util/db-schema/defaults";

import { evaluateWithLangChain } from "../evaluate-lc";
import { evaluateOllama } from "../ollama";
import { evaluateUserDefinedLLM } from "../user-defined";

let lastPromptMessages: unknown[] | undefined;
let lastOpenAIConfig: Record<string, unknown> | undefined;
let invokeResult:
  | {
      content: string;
      usage_metadata?: {
        input_tokens: number;
        output_tokens: number;
        total_tokens: number;
      };
    }
  | undefined;
let streamChunks: string[] = [];

var mockChatOpenAI: jest.Mock;
var mockChatAnthropic: jest.Mock;
var mockChatGoogle: jest.Mock;
var mockChatMistral: jest.Mock;
var mockChatXai: jest.Mock;
var mockGetCustomOpenAI: jest.Mock;
var mockOllama: jest.Mock;
var MockMessagesPlaceholder: any;

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

jest.mock("@langchain/anthropic", () => ({
  ChatAnthropic: (mockChatAnthropic = jest.fn()),
}));

jest.mock("@langchain/core/prompts", () => ({
  ChatPromptTemplate: {
    fromMessages: jest.fn((messages) => {
      lastPromptMessages = messages;
      const pipe = jest.fn((client) => ({ client }));
      return { pipe };
    }),
  },
  MessagesPlaceholder:
    (MockMessagesPlaceholder = class MockMessagesPlaceholder {
      name: string;
      constructor(name: string) {
        this.name = name;
      }
    }),
}));

jest.mock("@langchain/core/runnables", () => ({
  RunnableWithMessageHistory: jest.fn(() => {
    const invoke = jest.fn(async () => invokeResult);
    const stream = jest.fn(() =>
      (async function* () {
        for (const chunk of streamChunks) {
          yield chunk;
        }
      })(),
    );
    return {
      invoke,
      stream,
    };
  }),
}));

jest.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: (mockChatGoogle = jest.fn()),
}));

jest.mock("@langchain/mistralai", () => ({
  ChatMistralAI: (mockChatMistral = jest.fn()),
}));

jest.mock("@langchain/openai", () => ({
  ChatOpenAI: (mockChatOpenAI = jest.fn((config) => {
    lastOpenAIConfig = config;
    return { __config: config };
  })),
}));

jest.mock("@langchain/xai", () => ({
  ChatXAI: (mockChatXai = jest.fn()),
}));

jest.mock("@langchain/ollama", () => ({
  Ollama: (mockOllama = jest.fn()),
}));

jest.mock("../chat-history", () => ({
  transformHistoryToMessages: jest.fn(async () => ({
    messageHistory: [],
    tokens: 0,
  })),
}));

jest.mock("../client", () => {
  const actualModule = jest.requireActual("../client");
  return {
    ...actualModule,
    getCustomOpenAI: (mockGetCustomOpenAI = jest.fn(async () => ({}))),
  };
});

jest.mock("@cocalc/database", () => ({
  db: jest.fn(() => ({
    get_account: jest.fn(),
  })),
}));

jest.mock("@cocalc/util/async-utils", () => ({
  callback2: jest.fn(async () => ({})),
}));

describe("evaluateWithLangChain (LangChain mocked)", () => {
  const mockCallback2 = callback2 as jest.MockedFunction<typeof callback2>;
  const userAccountId = "123e4567-e89b-12d3-a456-426614174000";
  const userModel = "user-openai-gpt-4o-8k";
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
    lastPromptMessages = undefined;
    lastOpenAIConfig = undefined;
    streamChunks = [];
    invokeResult = {
      content: "ok",
      usage_metadata: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
    };
  });

  test("o1 prompt omits system role", async () => {
    const output = await evaluateWithLangChain({
      input: "hi",
      system: "sys",
      model: "o1-mini-8k",
    });

    expect(output.output).toBe("ok");
    expect(lastPromptMessages).toHaveLength(2);
    const [placeholder, human] = lastPromptMessages as any[];
    expect(placeholder).toBeInstanceOf(MockMessagesPlaceholder);
    expect(placeholder.name).toBe("history");
    expect(human).toEqual(["human", "sys\n\n{input}"]);
  });

  test("non-o1 prompt includes system role", async () => {
    await evaluateWithLangChain({
      input: "hi",
      system: "sys",
      model: "gpt-4o-8k",
    });

    expect(lastPromptMessages).toHaveLength(3);
    const [system, placeholder, human] = lastPromptMessages as any[];
    expect(system).toEqual(["system", "sys"]);
    expect(placeholder).toBeInstanceOf(MockMessagesPlaceholder);
    expect(placeholder.name).toBe("history");
    expect(human).toEqual(["human", "{input}"]);
  });

  test("custom OpenAI user mode passes endpoint and api key", async () => {
    await evaluateWithLangChain(
      {
        input: "hi",
        model: "gpt-4o",
        apiKey: "user-openai-key",
        endpoint: "https://example.com/v1",
        service: "custom_openai",
      },
      "user",
    );

    expect(lastOpenAIConfig).toMatchObject({
      apiKey: "user-openai-key",
      configuration: { baseURL: "https://example.com/v1" },
      model: "gpt-4o",
    });
  });

  test("OpenAI uses normalized model and server key", async () => {
    await evaluateWithLangChain({
      input: "hi",
      model: "gpt-4o-8k",
    });

    expect(mockChatOpenAI).toHaveBeenCalled();
    expect(lastOpenAIConfig).toMatchObject({
      apiKey: "server-openai-key",
      model: "gpt-4o",
    });
  });

  test("Google uses mapped model name", async () => {
    await evaluateWithLangChain({
      input: "hi",
      model: "gemini-2.5-flash-8k",
    });

    expect(mockChatGoogle).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "server-google-key",
        model: "gemini-2.5-flash",
      }),
    );
  });

  test("Anthropic uses version alias", async () => {
    await evaluateWithLangChain({
      input: "hi",
      model: "claude-4-5-sonnet-8k",
    });

    expect(mockChatAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "server-anthropic-key",
        model: "claude-sonnet-4-5",
      }),
    );
  });

  test("Mistral passes model through", async () => {
    await evaluateWithLangChain({
      input: "hi",
      model: "mistral-medium-latest",
    });

    expect(mockChatMistral).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "server-mistral-key",
        model: "mistral-medium-latest",
      }),
    );
  });

  test("xAI maps 16k model to provider name", async () => {
    await evaluateWithLangChain({
      input: "hi",
      model: "grok-4-1-fast-non-reasoning-16k",
    });

    expect(mockChatXai).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "server-xai-key",
        model: "grok-4-1-fast-non-reasoning",
      }),
    );
  });

  test("custom OpenAI platform mode uses getCustomOpenAI", async () => {
    await evaluateWithLangChain({
      input: "hi",
      model: "custom_openai-omni4high",
    });

    expect(mockGetCustomOpenAI).toHaveBeenCalledWith("omni4high");
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
        model: userModel,
      },
      userAccountId,
    );

    expect(lastOpenAIConfig).toMatchObject({
      apiKey: "user-openai-key",
      configuration: { baseURL: "https://api.openai.com/v1" },
      model: "gpt-4o-8k",
    });
  });

  test("user-defined Ollama with custom max_tokens", async () => {
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

    expect(mockOllama).toHaveBeenCalledWith({
      baseUrl: "http://localhost:11434",
      model: "llama3",
      keepAlive: "24h",
    });
  });

  test("user-defined Google with custom max_tokens", async () => {
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

    expect(mockChatGoogle).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "user-google-key",
        maxOutputTokens: 128000,
        model: "gemini-2.5-flash",
      }),
    );
  });

  test("ollama streams with configured model", async () => {
    streamChunks = ["hi", " there"];
    const stream = jest.fn();

    const output = await evaluateOllama({
      input: "hello",
      model: "ollama-llama3",
      stream,
    });

    expect(mockOllama).toHaveBeenCalledWith({
      baseUrl: "http://localhost:11434",
      model: "llama3",
      keepAlive: "24h",
    });
    expect(output.output).toBe("hi there");
    expect(stream).toHaveBeenCalledWith("hi");
    expect(stream).toHaveBeenCalledWith(" there");
    expect(stream).toHaveBeenCalledWith(null);
  });
});
