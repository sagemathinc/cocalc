import {
  DEFAULT_LLM_PRIORITY,
  isFreeModel,
  LANGUAGE_MODEL_SERVICES,
  LANGUAGE_MODELS,
  LLM_COST,
  model2vendor,
  OLLAMA_PREFIX,
  USER_SELECTABLE_LANGUAGE_MODELS,
  USER_SELECTABLE_LLMS_BY_VENDOR,
} from "./llm-utils";

describe("llm", () => {
  const is_cocalc_com = true; // otherwise, the test makes no sense

  test("isFreeModel", () => {
    expect(isFreeModel("gpt-3", is_cocalc_com)).toBe(true);
    expect(isFreeModel("gpt-4", is_cocalc_com)).toBe(false);
    // WARNING: if the following breaks, and ollama becomes non-free, then a couple of assumptions are broken as well.
    // search for model2service(...) as LanguageService in the codebase!
    expect(isFreeModel(`${OLLAMA_PREFIX}-1`, is_cocalc_com)).toBe(true);
  });

  test.each(Object.keys(LLM_COST))(
    "is valid model names in LLM_COST: '%s'",
    (model) => {
      expect(LANGUAGE_MODELS.includes(model as any)).toBe(true);
    },
  );

  test("all user selectable ones are valid", () => {
    for (const model of USER_SELECTABLE_LANGUAGE_MODELS) {
      expect(LANGUAGE_MODELS.includes(model)).toBe(true);
    }
  });

  // none of the user selectable models start with any of the vendor prefixes
  test.each(USER_SELECTABLE_LANGUAGE_MODELS)(
    "model '%s' does not start with any vendor prefix",
    (model) => {
      for (const prefix of LANGUAGE_MODEL_SERVICES) {
        expect(model.startsWith(prefix)).toBe(false);
      }
    },
  );

  test.each(LANGUAGE_MODELS)(
    `check that model2vendor('%s') knows the model`,
    (model) => {
      const vendor = model2vendor(model);
      expect(LANGUAGE_MODEL_SERVICES.includes(vendor.name)).toBe(true);
    },
  );

  test(`check model by vendor`, () => {
    for (const vendor in USER_SELECTABLE_LLMS_BY_VENDOR) {
      const models = USER_SELECTABLE_LLMS_BY_VENDOR[vendor];
      for (const model of models) {
        const v = model2vendor(model);
        expect(v.name).toBe(vendor);
        expect(v.url).toContain("https://");
      }
    }
  });

  test("just checking the price", () => {
    expect(1_000_000 * LLM_COST["gpt-4"].prompt_tokens).toBeCloseTo(30);
    expect(1_000_000 * LLM_COST["gpt-4"].completion_tokens).toBeCloseTo(60);
    expect(1_000_000 * LLM_COST["claude-3-opus"].prompt_tokens).toBeCloseTo(15);
    expect(1_000_000 * LLM_COST["claude-3-opus"].completion_tokens).toBeCloseTo(
      75,
    );
  });

  test("priority list is a shuffle of all llm vendors", () => {
    const prio = DEFAULT_LLM_PRIORITY;
    const vend = LANGUAGE_MODEL_SERVICES;
    // test, that those lists have the same elements
    expect(prio.length).toBe(vend.length);
    for (const v of vend) {
      expect(prio.includes(v)).toBe(true);
    }
  });
});
