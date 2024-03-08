// this tests the wrongly named openai.ts file

import { isFreeModel, LANGUAGE_MODELS, LLM_COST, OLLAMA_PREFIX } from "./llm";

describe("llm", () => {
  test("isFreeModel", () => {
    expect(isFreeModel("gpt-3")).toBe(true);
    expect(isFreeModel("gpt-4")).toBe(false);
    // WARNING: if the following breaks, and ollama becomes non-free, then a couple of assumptions are broken as well.
    // search for model2service(...) as LanguageService in the codebase!
    expect(isFreeModel(`${OLLAMA_PREFIX}-1`)).toBe(true);
  });

  test("all keys in the LLM_COST object are valid model names", () => {
    // ATTN: don't use isValidModel to test!
    for (const model in LLM_COST) {
      expect(LANGUAGE_MODELS.includes(model as any)).toBe(true);
    }
  });
});
