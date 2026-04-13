/**
 * Tests that admin-configured model settings (temperature, topK, headers, etc.)
 * are properly forwarded from server settings through getOllamaModel and
 * getCustomOpenAIModel to the AI SDK provider instantiation.
 */

import { getOllamaModel, getCustomOpenAIModel } from "../client";

// Track what createOpenAI receives at the provider level and model level
let lastProviderArgs: any = undefined;
let lastModelId: string | undefined = undefined;

jest.mock("@ai-sdk/openai", () => ({
  createOpenAI: (args: any) => {
    lastProviderArgs = args;
    const modelFn = (modelId: string) => {
      lastModelId = modelId;
      return { modelId, _provider: "mock" };
    };
    modelFn.chat = modelFn;
    return modelFn;
  },
}));

// Dynamic mock: each test sets its own server settings
let mockSettings: any = {};

jest.mock("@cocalc/database/settings/server-settings", () => ({
  getServerSettings: jest.fn(async () => mockSettings),
}));

beforeEach(() => {
  lastProviderArgs = undefined;
  lastModelId = undefined;
  mockSettings = {};
});

describe("getOllamaModel config passthrough", () => {
  test("forwards temperature and topK as requestOverrides", async () => {
    mockSettings = {
      ollama_configuration: {
        llama3: {
          baseUrl: "http://localhost:11434",
          model: "llama3:latest",
          temperature: 0.7,
          topK: 40,
        },
      },
    };

    const result = await getOllamaModel("llama3");

    expect(lastProviderArgs).toMatchObject({
      apiKey: "ollama",
      baseURL: "http://localhost:11434/v1",
    });
    expect(lastModelId).toBe("llama3:latest");
    expect(result.requestOverrides).toEqual({
      temperature: 0.7,
      topK: 40,
    });
  });

  test("forwards topP and seed as requestOverrides", async () => {
    mockSettings = {
      ollama_configuration: {
        mistral: {
          baseUrl: "http://gpu-server:11434",
          topP: 0.9,
          seed: 42,
        },
      },
    };

    const result = await getOllamaModel("mistral");

    expect(lastProviderArgs.baseURL).toBe("http://gpu-server:11434/v1");
    expect(lastModelId).toBe("mistral");
    expect(result.requestOverrides).toEqual({
      topP: 0.9,
      seed: 42,
    });
  });

  test("forwards custom headers at provider level", async () => {
    mockSettings = {
      ollama_configuration: {
        llama3: {
          baseUrl: "http://localhost:11434",
          headers: { "X-Custom": "value" },
        },
      },
    };

    const result = await getOllamaModel("llama3");

    expect(lastProviderArgs.headers).toEqual({ "X-Custom": "value" });
    expect(result.requestOverrides).toBeUndefined();
  });

  test("omits keepAlive (Ollama-native, not OpenAI-compatible)", async () => {
    mockSettings = {
      ollama_configuration: {
        llama3: {
          baseUrl: "http://localhost:11434",
          keepAlive: "24h",
          temperature: 0.5,
        },
      },
    };

    const result = await getOllamaModel("llama3");

    // keepAlive should not appear in provider args or requestOverrides
    expect(lastProviderArgs.keepAlive).toBeUndefined();
    expect(result.requestOverrides).toEqual({ temperature: 0.5 });
  });

  test("strips trailing slashes from baseUrl", async () => {
    mockSettings = {
      ollama_configuration: {
        llama3: {
          baseUrl: "http://localhost:11434///",
        },
      },
    };

    await getOllamaModel("llama3");

    expect(lastProviderArgs.baseURL).toBe("http://localhost:11434/v1");
  });

  test("returns no requestOverrides when config has no extra settings", async () => {
    mockSettings = {
      ollama_configuration: {
        llama3: {
          baseUrl: "http://localhost:11434",
          model: "llama3",
        },
      },
    };

    const result = await getOllamaModel("llama3");

    expect(result.requestOverrides).toBeUndefined();
    expect(result.model).toBeDefined();
  });

  test("throws when model is not configured", async () => {
    mockSettings = { ollama_configuration: {} };
    await expect(getOllamaModel("missing")).rejects.toThrow("not configured");
  });

  test("throws when model is disabled", async () => {
    mockSettings = {
      ollama_configuration: {
        llama3: {
          baseUrl: "http://localhost:11434",
          cocalc: { disabled: true },
        },
      },
    };
    await expect(getOllamaModel("llama3")).rejects.toThrow("disabled");
  });
});

describe("getCustomOpenAIModel config passthrough", () => {
  test("forwards temperature and frequencyPenalty as requestOverrides", async () => {
    mockSettings = {
      custom_openai_configuration: {
        omni4high: {
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-test",
          model: "gpt-4o",
          temperature: 1.5,
          frequencyPenalty: 0.5,
        },
      },
    };

    const result = await getCustomOpenAIModel("omni4high");

    expect(lastProviderArgs).toMatchObject({
      apiKey: "sk-test",
      baseURL: "https://api.openai.com/v1",
    });
    expect(lastModelId).toBe("gpt-4o");
    expect(result.requestOverrides).toEqual({
      temperature: 1.5,
      frequencyPenalty: 0.5,
    });
  });

  test("forwards custom headers at provider level", async () => {
    mockSettings = {
      custom_openai_configuration: {
        mymodel: {
          baseUrl: "https://custom-llm.example.com",
          apiKey: "key",
          headers: { Authorization: "Bearer custom-token" },
        },
      },
    };

    const result = await getCustomOpenAIModel("mymodel");

    expect(lastProviderArgs.headers).toEqual({
      Authorization: "Bearer custom-token",
    });
    expect(result.requestOverrides).toBeUndefined();
  });

  test("handles legacy openAIApiKey field", async () => {
    mockSettings = {
      custom_openai_configuration: {
        legacy: {
          baseUrl: "https://api.openai.com/v1",
          openAIApiKey: "sk-legacy",
        },
      },
    };

    await getCustomOpenAIModel("legacy");

    expect(lastProviderArgs.apiKey).toBe("sk-legacy");
  });

  test("handles legacy azureOpenAIApiKey field", async () => {
    mockSettings = {
      custom_openai_configuration: {
        azure: {
          baseUrl: "https://my-azure.openai.azure.com",
          azureOpenAIApiKey: "azure-key-123",
        },
      },
    };

    await getCustomOpenAIModel("azure");

    expect(lastProviderArgs.apiKey).toBe("azure-key-123");
  });

  test("prefers apiKey over legacy key fields", async () => {
    mockSettings = {
      custom_openai_configuration: {
        mixed: {
          baseUrl: "https://api.example.com",
          apiKey: "primary-key",
          openAIApiKey: "legacy-key",
        },
      },
    };

    await getCustomOpenAIModel("mixed");

    expect(lastProviderArgs.apiKey).toBe("primary-key");
  });

  test("returns no requestOverrides when config has no extra settings", async () => {
    mockSettings = {
      custom_openai_configuration: {
        basic: {
          baseUrl: "https://api.example.com",
          apiKey: "key",
          model: "my-model",
        },
      },
    };

    const result = await getCustomOpenAIModel("basic");

    expect(result.requestOverrides).toBeUndefined();
    expect(result.model).toBeDefined();
  });

  test("throws when model is not configured", async () => {
    mockSettings = { custom_openai_configuration: {} };
    await expect(getCustomOpenAIModel("missing")).rejects.toThrow(
      "not configured",
    );
  });

  test("throws when model is disabled", async () => {
    mockSettings = {
      custom_openai_configuration: {
        disabled: {
          baseUrl: "https://api.example.com",
          cocalc: { disabled: true },
        },
      },
    };
    await expect(getCustomOpenAIModel("disabled")).rejects.toThrow("disabled");
  });
});

describe("requestOverrides flow through evaluateWithAI", () => {
  // This test verifies the end-to-end flow: admin config → client →
  // evaluate → generateText call receives the overrides.

  let mockGenerateText: jest.Mock;

  beforeAll(() => {
    // The @ai-sdk/openai mock is already set up above.
    // We also need to mock the 'ai' module to capture generateText calls.
    jest.doMock("ai", () => ({
      generateText: (mockGenerateText = jest.fn(async () => ({
        text: "result",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }))),
      streamText: jest.fn(),
    }));
  });

  test("Ollama config requestOverrides reach generateText", async () => {
    mockSettings = {
      ollama_configuration: {
        llama3: {
          baseUrl: "http://localhost:11434",
          model: "llama3",
          temperature: 0.3,
          topK: 50,
        },
      },
    };

    // Dynamically import after mocks are set up
    const { evaluateWithAI } = await import("../evaluate");

    // Also need the settings mock for evaluate's own getServerSettings import
    jest.doMock("@cocalc/database/settings", () => ({
      getServerSettings: jest.fn(async () => mockSettings),
    }));

    jest.doMock("../chat-history", () => ({
      transformHistoryToMessages: jest.fn(() => ({
        messages: [],
        tokens: 0,
      })),
    }));

    await evaluateWithAI({
      input: "hello",
      model: "ollama-llama3",
    });

    expect(mockGenerateText).toHaveBeenCalledWith(
      expect.objectContaining({
        temperature: 0.3,
        topK: 50,
      }),
    );
  });
});
