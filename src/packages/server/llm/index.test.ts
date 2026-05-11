/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { normalizeOpenAIModel } from "./index";

describe("normalizeOpenAIModel", () => {
  // The function looks up an explicit OPENAI_VERSION entry to find the
  // OpenAI API model name. Bugs here are very expensive: a mismatch
  // silently routes the request to the wrong model and the user is
  // billed/credited under the originally selected name.

  describe("8k variants resolve to canonical model", () => {
    test("gpt-5.4-8k -> gpt-5.4", () => {
      expect(normalizeOpenAIModel("gpt-5.4-8k")).toBe("gpt-5.4");
    });

    test("gpt-5.4-mini-8k -> gpt-5.4-mini", () => {
      expect(normalizeOpenAIModel("gpt-5.4-mini-8k")).toBe("gpt-5.4-mini");
    });

    test("gpt-5.2-8k -> gpt-5.2", () => {
      expect(normalizeOpenAIModel("gpt-5.2-8k")).toBe("gpt-5.2");
    });

    test("gpt-5-mini-8k -> gpt-5-mini", () => {
      expect(normalizeOpenAIModel("gpt-5-mini-8k")).toBe("gpt-5-mini");
    });

    test("gpt-5-8k -> gpt-5", () => {
      expect(normalizeOpenAIModel("gpt-5-8k")).toBe("gpt-5");
    });

    test("gpt-4o-8k -> gpt-4o", () => {
      expect(normalizeOpenAIModel("gpt-4o-8k")).toBe("gpt-4o");
    });
  });

  describe("canonical names are idempotent", () => {
    test("gpt-5.5", () => {
      expect(normalizeOpenAIModel("gpt-5.5")).toBe("gpt-5.5");
    });

    test("gpt-5.4", () => {
      expect(normalizeOpenAIModel("gpt-5.4")).toBe("gpt-5.4");
    });

    test("gpt-5.4-mini", () => {
      expect(normalizeOpenAIModel("gpt-5.4-mini")).toBe("gpt-5.4-mini");
    });

    test("gpt-5", () => {
      expect(normalizeOpenAIModel("gpt-5")).toBe("gpt-5");
    });
  });

  // Regression test for the prefix-collision bug found by Codex review.
  // Before refactoring to an explicit OPENAI_VERSION map, the
  // normalization used prefix matching, and "gpt-5.5" silently matched
  // the more general "gpt-5" prefix first — getting routed to the
  // older model.
  describe("must not collide with shorter prefixes", () => {
    test("gpt-5.5 must not be routed to gpt-5", () => {
      expect(normalizeOpenAIModel("gpt-5.5")).not.toBe("gpt-5");
    });

    test("gpt-5.4-8k must not be routed to gpt-5", () => {
      expect(normalizeOpenAIModel("gpt-5.4-8k")).not.toBe("gpt-5");
    });

    test("gpt-5.4-mini-8k must not be routed to gpt-5-mini or gpt-5", () => {
      const result = normalizeOpenAIModel("gpt-5.4-mini-8k");
      expect(result).not.toBe("gpt-5-mini");
      expect(result).not.toBe("gpt-5");
    });

    test("gpt-5-mini-8k must not be routed to gpt-5", () => {
      expect(normalizeOpenAIModel("gpt-5-mini-8k")).not.toBe("gpt-5");
    });
  });

  describe("invalid input rejected", () => {
    test("non-OpenAI model throws", () => {
      expect(() => normalizeOpenAIModel("claude-4-6-sonnet-8k")).toThrow();
    });

    test("nonsense string throws", () => {
      expect(() => normalizeOpenAIModel("not-a-real-model")).toThrow();
    });
  });
});
