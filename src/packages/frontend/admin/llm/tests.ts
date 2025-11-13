import { History } from "@cocalc/util/types/llm";

export const PROMPTS: Readonly<
  {
    prompt: string;
    expected: string;
    history?: Readonly<History>;
    system?: string;
  }[]
> = [
  {
    // This test checks if history and system prompt work
    prompt: "What's my name?",
    expected: "STEPHEN",
    system: "Reply one word in uppercase letters.",
    history: [
      { role: "user", content: "My name is Stephen" },
      { role: "assistant", content: "UNDERSTOOD" },
    ],
  },
  { prompt: "What's 9 + 91? Reply only the number!", expected: "100" },
  {
    prompt: "Show me the LaTeX Formula for 'a/(b+c). Reply only the formula!",
    expected: "frac",
  },
] as const;
