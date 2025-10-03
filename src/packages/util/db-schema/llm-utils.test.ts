import {
  DEFAULT_LLM_PRIORITY,
  DEFAULT_MODEL,
  getValidLanguageModelName,
  isCoreLanguageModel,
  isFreeModel,
  LANGUAGE_MODEL_SERVICES,
  LANGUAGE_MODELS,
  LanguageService,
  LLM_COST,
  LLMServicesAvailable,
  model2vendor,
  OLLAMA_PREFIX,
  SERVICES,
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
    // except for "user"
    const prio = DEFAULT_LLM_PRIORITY;
    const vend = SERVICES;
    // test, that those lists have the same elements
    expect(prio.length).toBe(vend.length);
    for (const v of vend) {
      expect(prio.includes(v)).toBe(true);
    }
  });

  test("getting valid language model", () => {
    const selectable_llms = [...USER_SELECTABLE_LANGUAGE_MODELS];
    const notAvailable = selectable_llms.pop();

    function getModel(model: LanguageService, disabled?: LanguageService) {
      const allEnabled = LANGUAGE_MODEL_SERVICES.reduce((acc, svc) => {
        acc[svc] = disabled !== svc;
        return acc;
      }, {}) as LLMServicesAvailable;
      return getValidLanguageModelName({
        model,
        filter: allEnabled,
        ollama: ["phi3"],
        custom_openai: ["bar"],
        selectable_llms,
      });
    }

    // meaningless name
    expect(getModel("foobar")).toEqual(DEFAULT_MODEL);
    expect(getModel("baz-delta99")).toEqual(DEFAULT_MODEL);
    // gpt 3.5 is disabled
    expect(getModel("gpt-3.5-turbo")).toEqual(DEFAULT_MODEL);
    // not available
    expect(
      typeof notAvailable === "string" && isCoreLanguageModel(notAvailable),
    ).toBe(true);
    if (typeof notAvailable === "string") {
      expect(getModel(notAvailable)).toEqual(DEFAULT_MODEL);
    }
    // not disabled
    expect(getModel("mistral-large-latest")).toEqual("mistral-large-latest");
    expect(getModel("gpt-4")).toEqual("gpt-4");
    expect(getModel(DEFAULT_MODEL)).toEqual(DEFAULT_MODEL);
    expect(getModel("magistral-medium-latest")).toEqual(DEFAULT_MODEL);
    expect(getModel("mistral-large-latest")).toEqual("mistral-large-latest");
    expect(getModel("claude-3-5-haiku-8k")).toEqual("claude-3-5-haiku-8k");
    // anthropic service disabled
    expect(getModel("claude-3-5-haiku-8k", "anthropic")).toEqual(DEFAULT_MODEL);
    // ollama
    expect(getModel("ollama-foo")).toEqual(DEFAULT_MODEL);
    expect(getModel("ollama-phi3")).toEqual("ollama-phi3");
    // openai api
    expect(getModel("custom_openai-foo")).toEqual(DEFAULT_MODEL);
    expect(getModel("custom_openai-bar")).toEqual("custom_openai-bar");
    // user models: there are no further checks
    expect(getModel("user-custom_openai-foo")).toEqual(
      "user-custom_openai-foo",
    );
    expect(getModel("user-openai-gpt-3.5-turbo")).toEqual(
      "user-openai-gpt-3.5-turbo",
    );
    // it's ok to use a model if disabled by the admin, since it's their key
    expect(getModel("user-anthropic-claude-3-5-haiku-8k", "anthropic")).toEqual(
      "user-anthropic-claude-3-5-haiku-8k",
    );
    // meaningless user service
    expect(getModel("user-baz-delta99")).toEqual(DEFAULT_MODEL);
  });
});
