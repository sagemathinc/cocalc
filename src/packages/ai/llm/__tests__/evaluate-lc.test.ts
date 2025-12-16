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

const mockPromptAndRunnablesInvoke = () => {
  jest.doMock("@langchain/core/prompts", () => {
    return {
      ChatPromptTemplate: {
        fromMessages: (_messages: any[]) => ({
          pipe: (runnable: any) => runnable,
        }),
      },
      MessagesPlaceholder: class {},
    };
  });
  jest.doMock("@langchain/core/runnables", () => {
    return {
      RunnableWithMessageHistory: class {
        constructor(private readonly opts: any) {}
        async invoke(input: any): Promise<any> {
          await this.opts.getMessageHistory?.();
          return this.opts.runnable.invoke
            ? this.opts.runnable.invoke(input)
            : this.opts.runnable(input);
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
    ).rejects.toThrow(
      "Custom OpenAI requested but no getCustomOpenAI provider supplied",
    );
  });

  it("streams chunks and terminates with null", async () => {
    const chunksEmitted: string[] = [];
    const streamSpy = (chunk: string | null) => {
      if (chunk !== null) chunksEmitted.push(chunk);
      else chunksEmitted.push("null");
    };

    // Mock OpenAI to return an async iterator for streaming
    jest.doMock("@langchain/openai", () => {
      return {
        ChatOpenAI: class {
          constructor(public readonly opts: any) {}
          async *stream(): AsyncGenerator<any> {
            yield { content: [{ type: "text", text: "A" }] };
            yield { content: [{ type: "text", text: "B" }] };
          }
        },
      };
    });

    // Minimal prompt/runnable scaffold for streaming handling
    jest.doMock("@langchain/core/prompts", () => {
      return {
        ChatPromptTemplate: {
          fromMessages: (_messages: any[]) => ({
            pipe: (runnable: any) => runnable,
          }),
        },
        MessagesPlaceholder: class {},
      };
    });

    jest.doMock("@langchain/core/runnables", () => {
      return {
        RunnableWithMessageHistory: class {
          constructor(private readonly opts: any) {}
          async stream(input: any): Promise<AsyncGenerator<any>> {
            // Delegate to underlying runnable's stream
            return this.opts.runnable.stream(input);
          }
        },
      };
    });

    const { evaluateWithLangChain } = await import("../evaluate-lc");

    const result = await evaluateWithLangChain(
      { input: "hi", model: "gpt-4o", stream: streamSpy },
      { settings: {}, tokenCounter: (s) => s.length },
    );

    expect(chunksEmitted).toEqual(["A", "B", "null"]);
    expect(result.output).toBe("AB");
  });

  it("adds history tokens reported by transformHistoryToMessages in fallback path", async () => {
    const historyTokens = 5;
    mockOpenAIWithoutUsage();

    jest.doMock("../chat-history", () => ({
      transformHistoryToMessages: async (_history: any) => ({
        messageHistory: [],
        tokens: historyTokens,
      }),
    }));

    // Provide a lightweight prompt/runnable scaffolding so invoke() is available
    jest.doMock("@langchain/core/prompts", () => {
      return {
        ChatPromptTemplate: {
          fromMessages: (_messages: any[]) => ({
            pipe: (runnable: any) => runnable,
          }),
        },
        MessagesPlaceholder: class {},
      };
    });
    jest.doMock("@langchain/core/runnables", () => {
      return {
        RunnableWithMessageHistory: class {
          constructor(private readonly opts: any) {}
          async invoke(input: any): Promise<any> {
            // Trigger history loading so evaluateWithLangChain sees tokens
            await this.opts.getMessageHistory?.();
            return this.opts.runnable.invoke
              ? this.opts.runnable.invoke(input)
              : this.opts.runnable(input);
          }
        },
      };
    });

    const { evaluateWithLangChain } = await import("../evaluate-lc");

    const ctx: LLMContext = {
      settings: {},
      tokenCounter: (s) => s.length,
    };

    const result = await evaluateWithLangChain(
      {
        input: "abc",
        model: "gpt-4o",
        history: [{ role: "user", content: "h" }],
      },
      ctx,
    );

    // tokenCounter counts "abc" as 3, plus historyTokens from transformHistoryToMessages
    expect(result.prompt_tokens).toBe(historyTokens + 3);
  });

  it("prefers usage_metadata in streaming mode when provided on final chunk", async () => {
    const streamArgs: string[] = [];
    const streamSpy = (chunk: string | null) => {
      if (chunk !== null) streamArgs.push(chunk);
      else streamArgs.push("null");
    };

    jest.doMock("@langchain/openai", () => {
      return {
        ChatOpenAI: class {
          async *stream(): AsyncGenerator<any> {
            yield { content: [{ type: "text", text: "A" }] };
            yield {
              content: [{ type: "text", text: "B" }],
              usage_metadata: {
                input_tokens: 10,
                output_tokens: 20,
                total_tokens: 30,
              },
            };
          }
        },
      };
    });

    jest.doMock("@langchain/core/prompts", () => {
      return {
        ChatPromptTemplate: {
          fromMessages: (_messages: any[]) => ({
            pipe: (runnable: any) => runnable,
          }),
        },
        MessagesPlaceholder: class {},
      };
    });
    jest.doMock("@langchain/core/runnables", () => {
      return {
        RunnableWithMessageHistory: class {
          constructor(private readonly opts: any) {}
          async stream(input: any): Promise<AsyncGenerator<any>> {
            return this.opts.runnable.stream(input);
          }
        },
      };
    });

    const { evaluateWithLangChain } = await import("../evaluate-lc");

    const result = await evaluateWithLangChain(
      { input: "hi", model: "gpt-4o", stream: streamSpy },
      { settings: {}, tokenCounter: (s) => s.length },
    );

    expect(streamArgs).toEqual(["A", "B", "null"]);
    expect(result.total_tokens).toBe(30); // from usage_metadata
    expect(result.prompt_tokens).toBe(10);
    expect(result.completion_tokens).toBe(20);
  });

  it("adds history tokens in streaming fallback when usage_metadata is absent", async () => {
    const streamArgs: string[] = [];
    const streamSpy = (chunk: string | null) => {
      if (chunk !== null) streamArgs.push(chunk);
      else streamArgs.push("null");
    };

    const historyTokens = 7;

    jest.doMock("@langchain/openai", () => {
      return {
        ChatOpenAI: class {
          async *stream(): AsyncGenerator<any> {
            yield { content: [{ type: "text", text: "X" }] };
          }
        },
      };
    });

    jest.doMock("@langchain/core/prompts", () => {
      return {
        ChatPromptTemplate: {
          fromMessages: (_messages: any[]) => ({
            pipe: (runnable: any) => runnable,
          }),
        },
        MessagesPlaceholder: class {},
      };
    });
    jest.doMock("@langchain/core/runnables", () => {
      return {
        RunnableWithMessageHistory: class {
          constructor(private readonly opts: any) {}
          async stream(input: any): Promise<AsyncGenerator<any>> {
            await this.opts.getMessageHistory?.();
            return this.opts.runnable.stream(input);
          }
        },
      };
    });
    jest.doMock("../chat-history", () => ({
      transformHistoryToMessages: async (_history: any) => ({
        messageHistory: [],
        tokens: historyTokens,
      }),
    }));

    const { evaluateWithLangChain } = await import("../evaluate-lc");

    const result = await evaluateWithLangChain(
      { input: "hi", model: "gpt-4o", stream: streamSpy },
      { settings: {}, tokenCounter: (s) => s.length },
    );

    expect(streamArgs).toEqual(["X", "null"]);
    // prompt_tokens = len("hi") + historyTokens, completion_tokens = len("X")
    expect(result.prompt_tokens).toBe(2 + historyTokens);
    expect(result.completion_tokens).toBe(1);
    expect(result.total_tokens).toBe(
      result.prompt_tokens + result.completion_tokens,
    );
  });

  it("uses user-provided apiKey when mode=user (OpenAI)", async () => {
    const captures: any[] = [];
    mockOpenAIWithUsage(captures);
    mockPromptAndRunnablesInvoke();
    const { evaluateWithLangChain } = await import("../evaluate-lc");

    await evaluateWithLangChain(
      { input: "hi", model: "gpt-4o", apiKey: "user-key" },
      {
        settings: { openai_api_key: "server-key" },
        mode: "user",
        tokenCounter: (s) => s.length,
      },
    );

    expect(captures[0].apiKey).toBe("user-key");
  });

  it("uses user-provided apiKey when mode=user (Google)", async () => {
    const googleArgs: any[] = [];
    jest.doMock("@langchain/google-genai", () => ({
      ChatGoogleGenerativeAI: class {
        constructor(args: any) {
          googleArgs.push(args);
        }
        async invoke() {
          return { content: "google" };
        }
      },
    }));
    mockOpenAIWithUsage();
    mockPromptAndRunnablesInvoke();
    const { evaluateWithLangChain } = await import("../evaluate-lc");

    await evaluateWithLangChain(
      { input: "hi", model: "gemini-2.5-flash-8k", apiKey: "user-key" },
      {
        settings: { google_vertexai_key: "server-key" },
        mode: "user",
        tokenCounter: (s) => s.length,
      },
    );

    expect(googleArgs[0].apiKey).toBe("user-key");
  });

  it("uses user-provided apiKey when mode=user (Anthropic)", async () => {
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
    mockPromptAndRunnablesInvoke();
    const { evaluateWithLangChain } = await import("../evaluate-lc");

    await evaluateWithLangChain(
      { input: "hi", model: "claude-4-sonnet-8k", apiKey: "user-key" },
      {
        settings: { anthropic_api_key: "server-key" },
        mode: "user",
        tokenCounter: (s) => s.length,
      },
    );

    expect(anthropicArgs[0].apiKey).toBe("user-key");
  });

  it("normalizes OpenAI model aliases (direct helper)", async () => {
    const { normalizeOpenAIModel } = await import("../normalize-openai");
    expect(normalizeOpenAIModel("gpt-4o-2024-07-15")).toBe("gpt-4o");
  });

  it("omits system message for o1/o1-mini models", async () => {
    const messagesCaptured: any[] = [];
    let Placeholder: any;
    await jest.isolateModulesAsync(async () => {
      jest.doMock("@langchain/core/prompts", () => {
        Placeholder = class {};
        return {
          ChatPromptTemplate: {
            fromMessages: (msgs: any[]) => {
              messagesCaptured.push(msgs);
              return { pipe: (runnable: any) => runnable };
            },
          },
          MessagesPlaceholder: Placeholder,
        };
      });
      jest.doMock("@langchain/core/runnables", () => {
        return {
          RunnableWithMessageHistory: class {
            constructor(private readonly opts: any) {}
            async invoke(input: any): Promise<any> {
              await this.opts.getMessageHistory?.();
              return this.opts.runnable.invoke
                ? this.opts.runnable.invoke(input)
                : this.opts.runnable(input);
            }
          },
        };
      });
      mockOpenAIWithUsage();
      const { evaluateWithLangChain } = require("../evaluate-lc");
      await evaluateWithLangChain(
        { input: "hi", model: "o1-mini" },
        {
          settings: { openai_api_key: "server-key" },
          tokenCounter: (s: string) => s.length,
        },
      );
    });

    const usedMessages = messagesCaptured[0];
    expect(usedMessages[0]).toBeInstanceOf(Placeholder);
  });

  it("uses direct ChatOpenAI when endpoint is provided for custom openai", async () => {
    const captures: any[] = [];
    jest.doMock("@langchain/openai", () => {
      return {
        ChatOpenAI: class {
          constructor(args: any) {
            captures.push(args);
          }
          async invoke() {
            return { content: "direct-endpoint" };
          }
        },
      };
    });
    mockPromptAndRunnablesInvoke();
    // ensure custom provider isn't used
    const { evaluateWithLangChain } = await import("../evaluate-lc");

    const result = await evaluateWithLangChain(
      {
        input: "hi",
        model: "custom_openai-gpt-4o-mini",
        apiKey: "user-key",
        endpoint: "https://example.com",
      },
      {
        settings: {},
        tokenCounter: (s) => s.length,
        getCustomOpenAI: async () => {
          throw new Error("should not be called");
        },
      },
    );

    expect(captures[0].configuration?.baseURL).toBe("https://example.com");
    expect(result.output).toBe("direct-endpoint");
  });

  it("throws when context.settings is missing", async () => {
    mockOpenAIWithUsage();
    const { evaluateWithLangChain } = await import("../evaluate-lc");

    await expect(
      evaluateWithLangChain({ input: "hi", model: "gpt-4o" } as any, {} as any),
    ).rejects.toThrow("LLM context with settings is required");
  });

  it("throws on unknown model", async () => {
    mockOpenAIWithUsage();
    const { evaluateWithLangChain } = await import("../evaluate-lc");

    await expect(
      evaluateWithLangChain(
        { input: "hi", model: "not-a-model" },
        { settings: {}, tokenCounter: (s) => s.length },
      ),
    ).rejects.toThrow("Unknown model provider for: not-a-model");
  });
});

describe("evaluateOllama", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("uses getOllama from context and streams output", async () => {
    const streamChunks: string[] = [];
    const streamSpy = (chunk: string | null) => {
      if (chunk !== null) streamChunks.push(chunk);
      else streamChunks.push("null");
    };

    jest.doMock("@langchain/core/prompts", () => {
      return {
        ChatPromptTemplate: {
          fromMessages: (_msgs: any[]) => ({
            pipe: (_ollama: any) => ({
              stream: async function* () {
                yield "O";
                yield "K";
              },
            }),
          }),
        },
        MessagesPlaceholder: class {},
      };
    });
    jest.doMock("@langchain/core/runnables", () => {
      return {
        RunnableWithMessageHistory: class {
          constructor(private readonly opts: any) {}
          async stream(input: any): Promise<AsyncGenerator<any>> {
            await this.opts.getMessageHistory?.();
            return this.opts.runnable.stream(input);
          }
        },
      };
    });
    jest.doMock("../chat-history", () => ({
      transformHistoryToMessages: async (_history: any) => ({
        messageHistory: [],
        tokens: 2,
      }),
    }));

    const { evaluateOllama } = await import("../ollama");

    const result = await evaluateOllama(
      { input: "abc", model: "ollama-foo", stream: streamSpy },
      { getOllama: async () => ({}) as any },
      undefined,
    );

    expect(streamChunks).toEqual(["O", "K", "null"]);
    // token heuristic: ceil(len/4)
    expect(result.prompt_tokens).toBe(Math.ceil("abc".length / 4) + 2);
    expect(result.completion_tokens).toBe(Math.ceil("OK".length / 4));
    expect(result.total_tokens).toBe(
      result.prompt_tokens + result.completion_tokens,
    );
  });

  it("throws when Ollama client is unavailable", async () => {
    const { evaluateOllama } = await import("../ollama");
    await expect(
      evaluateOllama({ input: "abc", model: "ollama-foo" }, {}, undefined),
    ).rejects.toThrow("No Ollama client available");
  });
});
