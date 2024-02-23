// this tests the wrongly named openai.ts file

import { isFreeModel } from "./llm";

describe("openai/llm", () => {
  test("isFreeModel", () => {
    expect(isFreeModel("gpt-3")).toBe(true);
    expect(isFreeModel("gpt-4")).toBe(false);
    // WARNING: if the following breaks, and ollama becomes non-free, then a couple of assumptions are broken as well.
    // search for model2service(...) as LanguageService in the codebase!
    expect(isFreeModel("ollama-1")).toBe(true);
  });
});
