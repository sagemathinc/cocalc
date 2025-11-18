import type { ChatOutput } from "@cocalc/util/types/llm";
import type { LLMContext } from "../evaluate-lc";

// Mock LangChain building blocks with lightweight stubs.
const mockOpenAIWithUsage = (capture: any[] = []) => {
  jest.doMock("@langchain/openai", () => {
    return {
      ChatOpenAI: class {
        constructor(public readonly opts: any) {
          capture.push(opts);
        }
        async invoke(_input: any): Promise<any> {
          return {
            content: "openai-output",
            usage_metadata: {
              input_tokens: 2,
              output_tokens: 3,
              total_tokens: 5,
            },
          };
        }
      },
    };
  });
};

const mockOpenAIWithoutUsage = (capture: any[] = []) => {
  jest.doMock("@langchain/openai", () => {
    return {
      ChatOpenAI: class {
        constructor(public readonly opts: any) {
          capture.push(opts);
        }
        async invoke(): Promise<any> {
          return { content: "no-usage" };
        }
      },
    };
  });
};

jest.mock("@langchain/core/prompts", () => {
  return {
    ChatPromptTemplate: {
      fromMessages: (_messages: any[]) => ({
        pipe: (runnable: any) => runnable,
      }),
    },
    MessagesPlaceholder: class {},
  };
});

jest.mock("@langchain/core/runnables", () => {
  return {
    RunnableWithMessageHistory: class {
      constructor(private readonly opts: any) {}
      async invoke(input: any): Promise<any> {
        return this.opts.runnable.invoke(input);
      }
    },
  };
});

jest.mock("@langchain/core/utils/stream", () => ({
  concat: (_a: any, b: any) => b,
}));

jest.mock("../chat-history", () => ({
  transformHistoryToMessages: async (_history: any) => ({
    messageHistory: [],
    tokens: 0,
  }),
}));

describe("evaluateWithLangChain", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  const baseContext: LLMContext = {
    settings: {
      openai_api_key: "test-key",
    },
    tokenCounter: (text: string) => text.length, // deterministic fallback
  };

  it("returns usage metadata when provided by the model", async () => {
    mockOpenAIWithUsage();
    const { evaluateWithLangChain } = await import("../evaluate-lc");

    const result: ChatOutput = await evaluateWithLangChain(
      { input: "hello", model: "gpt-4o" },
      baseContext,
    );

    expect(result).toEqual({
      output: "openai-output",
      prompt_tokens: 2,
      completion_tokens: 3,
      total_tokens: 5,
    });
  });

  it("falls back to injected tokenCounter when usage metadata is missing", async () => {
    mockOpenAIWithoutUsage();
    const { evaluateWithLangChain } = await import("../evaluate-lc");

    const result: ChatOutput = await evaluateWithLangChain(
      { input: "abc", model: "gpt-4o" },
      baseContext,
    );

    expect(result.prompt_tokens).toBe(3); // length("abc")
    expect(result.completion_tokens).toBe("no-usage".length);
    expect(result.total_tokens).toBe(
      result.prompt_tokens + result.completion_tokens,
    );
  });

  it("routes to Google GenAI and maps model names", async () => {
    const googleArgs: any[] = [];
    jest.doMock("@langchain/google-genai", () => {
      return {
        ChatGoogleGenerativeAI: class {
          constructor(args: any) {
            googleArgs.push(args);
          }
          async invoke() {
            return { content: "google" };
          }
        },
      };
    });
    mockOpenAIWithUsage(); // prevent accidental import fallback

    const { evaluateWithLangChain } = await import("../evaluate-lc");

    const ctx: LLMContext = {
      settings: { google_vertexai_key: "g-key" },
      tokenCounter: (s) => s.length,
    };

    await evaluateWithLangChain(
      { input: "hi", model: "gemini-2.5-flash-8k" },
      ctx,
    );

    expect(googleArgs[0].model).toBe("gemini-2.5-flash"); // mapped
    expect(googleArgs[0].apiKey).toBe("g-key");
  });

  it("routes to Anthropic and uses versioned model names", async () => {
    const anthropicArgs: any[] = [];
    jest.doMock("@langchain/anthropic", () => ({
      ChatAnthropic: class {
        constructor(args: any) {
          anthropicArgs.push(args);
        }
        async invoke() {
          return { content: "anthropic" };
        }
      },
    }));
    mockOpenAIWithUsage();

    const { evaluateWithLangChain } = await import("../evaluate-lc");

    const ctx: LLMContext = {
      settings: { anthropic_api_key: "a-key" },
      tokenCounter: (s) => s.length,
    };

    await evaluateWithLangChain(
      { input: "hi", model: "claude-4-sonnet-8k" },
      ctx,
    );

    expect(anthropicArgs[0].model).toBe("claude-sonnet-4-0"); // versioned
    expect(anthropicArgs[0].apiKey).toBe("a-key");
  });

  it("routes to Mistral and prefers user apiKey when mode=user", async () => {
    const mistralArgs: any[] = [];
    jest.doMock("@langchain/mistralai", () => ({
      ChatMistralAI: class {
        constructor(args: any) {
          mistralArgs.push(args);
        }
        async invoke() {
          return { content: "mistral" };
        }
      },
    }));
    mockOpenAIWithUsage();

    const { evaluateWithLangChain } = await import("../evaluate-lc");

    const ctx: LLMContext = {
      settings: { mistral_api_key: "server-key" },
      mode: "user",
      tokenCounter: (s) => s.length,
    };

    await evaluateWithLangChain(
      { input: "hi", model: "mistral-medium-latest", apiKey: "user-key" },
      ctx,
    );

    expect(mistralArgs[0].apiKey).toBe("user-key");
  });

  it("routes to Custom OpenAI and uses getCustomOpenAI provider", async () => {
    const customCalls: string[] = [];
    jest.doMock("@langchain/openai", () => {
      return {
        ChatOpenAI: class {
          constructor(public readonly opts: any) {
            // this is only reached if apiKey/endpoint passed
            customCalls.push(`direct:${opts.model}`);
          }
          async invoke(): Promise<any> {
            return { content: "custom-direct" };
          }
        },
      };
    });

    const getCustomOpenAI = async (model: string) => {
      customCalls.push(`factory:${model}`);
      return {
        async invoke() {
          return { content: "custom-factory" };
        },
      } as any;
    };

    const { evaluateWithLangChain } = await import("../evaluate-lc");

    const ctx: LLMContext = {
      settings: {},
      tokenCounter: (s) => s.length,
      getCustomOpenAI,
    };

    const result = await evaluateWithLangChain(
      { input: "hi", model: "custom_openai-gpt-4o-mini" },
      ctx,
    );

    expect(customCalls).toContain("factory:gpt-4o-mini"); // fromCustomOpenAIModel strips prefix
    expect(result.output).toBe("custom-factory");
  });

  it("throws when Custom OpenAI is requested but no provider is supplied", async () => {
    mockOpenAIWithUsage();
    const { evaluateWithLangChain } = await import("../evaluate-lc");

    await expect(
      evaluateWithLangChain(
        { input: "hi", model: "custom_openai-gpt-4o-mini" },
        { settings: {}, tokenCounter: (s) => s.length },
      ),
    ).rejects.toThrow("Custom OpenAI requested but no getCustomOpenAI provider supplied");
  });
});
