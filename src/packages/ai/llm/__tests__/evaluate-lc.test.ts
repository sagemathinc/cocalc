import type { ChatOutput } from "@cocalc/util/types/llm";
import type { LLMContext } from "../evaluate-lc";

// Mock LangChain building blocks with lightweight stubs.
const mockOpenAIWithUsage = () => {
  jest.doMock("@langchain/openai", () => {
    return {
      ChatOpenAI: class {
        constructor(public readonly opts: any) {}
        async invoke(_input: any): Promise<any> {
          // Simulate a successful non-streaming response with usage metadata
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

const mockOpenAIWithoutUsage = () => {
  jest.doMock("@langchain/openai", () => {
    return {
      ChatOpenAI: class {
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

jest.mock("@langchain/anthropic", () => ({
  ChatAnthropic: class {
    async invoke(): Promise<any> {
      return { content: "anthropic" };
    }
  },
}));

jest.mock("@langchain/google-genai", () => ({
  ChatGoogleGenerativeAI: class {
    async invoke(): Promise<any> {
      return { content: "google" };
    }
  },
}));

jest.mock("@langchain/mistralai", () => ({
  ChatMistralAI: class {
    async invoke(): Promise<any> {
      return { content: "mistral" };
    }
  },
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
});
