// this tests the wrongly named openai.ts file

import {
  isFreeModel,
  LANGUAGE_MODEL_VENDORS,
  LANGUAGE_MODELS,
  LLM_COST,
  OLLAMA_PREFIX,
  USER_SELECTABLE_LANGUAGE_MODELS,
} from "./llm-utils";

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

  test("all user selectable ones are valid", () => {
    for (const model of USER_SELECTABLE_LANGUAGE_MODELS) {
      expect(LANGUAGE_MODELS.includes(model)).toBe(true);
    }
  });

  test("none of the user selectable models start with any of the vendor prefixes", () => {
    for (const model of USER_SELECTABLE_LANGUAGE_MODELS) {
      for (const prefix of LANGUAGE_MODEL_VENDORS) {
        expect(model.startsWith(prefix)).toBe(false);
      }
    }
  });
});
