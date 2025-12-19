/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { History } from "@cocalc/frontend/client/types";
import {
  getMaxTokens,
  numTokensUpperBound,
  truncateHistory,
  truncateMessage,
} from "./llm";

describe("llm tokenizer functions", () => {
  describe("numTokensUpperBound", () => {
    test("returns reasonable token count for short text", () => {
      const content = "Hello, world!";
      const result = numTokensUpperBound(content, 1000);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(20); // "Hello, world!" should be ~3-5 tokens
    });

    test("returns reasonable token count for longer text", () => {
      const content =
        "The quick brown fox jumps over the lazy dog. " +
        "This is a test of the tokenizer. ";
      const result = numTokensUpperBound(content, 1000);
      expect(result).toBeGreaterThan(10);
      expect(result).toBeLessThan(50);
    });

    test("handles very long text by truncating before tokenization", () => {
      // Create a very long string (250k characters)
      const content = "a".repeat(250000);
      const maxTokens = 4096;

      // Should not freeze - should return a result
      const result = numTokensUpperBound(content, maxTokens);

      // Result should be reasonable upper bound (much larger than maxTokens due to unprocessed tail)
      expect(result).toBeGreaterThan(maxTokens);
      // Should be less than or equal to the full character count
      expect(result).toBeLessThanOrEqual(content.length);
    });

    test("handles empty string", () => {
      const result = numTokensUpperBound("", 1000);
      expect(result).toBe(0);
    });

    test("returns upper bound that is >= actual token count", () => {
      // The function should always return an upper bound, never less than actual
      const content = "The quick brown fox jumps over the lazy dog";
      const maxTokens = 1000;
      const upperBound = numTokensUpperBound(content, maxTokens);

      // Get actual token count for comparison
      const { encode } = require("gpt-tokenizer");
      const actualTokenCount = encode(content).length;

      // Upper bound should be >= actual token count
      expect(upperBound).toBeGreaterThanOrEqual(actualTokenCount);
      // Should be reasonably close (not wildly over-estimated)
      expect(upperBound).toBeLessThan(actualTokenCount * 2);
    });
  });

  describe("truncateMessage", () => {
    test("does not truncate short messages", () => {
      const content = "Hello, world!";
      const maxTokens = 1000;
      const result = truncateMessage(content, maxTokens);
      expect(result).toBe(content);
    });

    test("truncates long messages and adds ellipsis", () => {
      // Use varied text that will create many tokens (not just repeated chars)
      const content = "The quick brown fox jumps over the lazy dog. ".repeat(
        500,
      );
      const maxTokens = 50;
      const result = truncateMessage(content, maxTokens);

      // Should be truncated (original is definitely > 50 tokens)
      expect(result.length).toBeLessThan(content.length);

      // Check result token count is within limit
      const { encode } = require("gpt-tokenizer");
      const resultTokens = encode(result).length;
      expect(resultTokens).toBeLessThanOrEqual(maxTokens + 5); // small buffer for ellipsis

      // Should end with ellipsis marker (note: actual marker is "\n ...")
      expect(result).toMatch(/\s*\.\.\./);
    });

    test("respects maxTokens limit", () => {
      const content = "The quick brown fox ".repeat(200); // ~800 tokens
      const maxTokens = 50;
      const result = truncateMessage(content, maxTokens);

      // Verify result is within token limit
      const resultTokens = numTokensUpperBound(result, maxTokens + 10);
      expect(resultTokens).toBeLessThanOrEqual(maxTokens + 5); // small buffer for ellipsis
    });

    test("handles empty string", () => {
      const result = truncateMessage("", 1000);
      expect(result).toBe("");
    });

    test("preserves original content when under limit", () => {
      const content = "This is a reasonable length message.";
      const maxTokens = 1000;
      const result = truncateMessage(content, maxTokens);
      expect(result).toBe(content);
    });
  });

  describe("truncateHistory", () => {
    const model = "gpt-4o-8k";

    test("does not truncate short history", () => {
      const history: History = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];
      const maxTokens = 1000;
      const result = truncateHistory(history, maxTokens, model);

      expect(result.length).toBe(2);
      expect(result[0].content).toBe("Hello");
      expect(result[1].content).toBe("Hi there!");
    });

    test("truncates history when over token limit", () => {
      const longMessage = "The quick brown fox ".repeat(500);
      const history: History = [
        { role: "user", content: longMessage },
        { role: "assistant", content: longMessage },
        { role: "user", content: longMessage },
        { role: "assistant", content: longMessage },
      ];
      const maxTokens = 500; // Lower limit to force truncation
      const result = truncateHistory(history, maxTokens, model);

      // Calculate total tokens in result
      let totalTokens = 0;
      for (const msg of result) {
        totalTokens += numTokensUpperBound(msg.content, 1000);
      }
      // Should be under the token limit
      expect(totalTokens).toBeLessThanOrEqual(maxTokens + 50); // Small buffer
    });

    test("returns empty array when maxTokens is 0", () => {
      const history: History = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ];
      const result = truncateHistory(history, 0, model);
      expect(result).toEqual([]);
    });

    test("handles empty history", () => {
      const result = truncateHistory([], 1000, model);
      expect(result).toEqual([]);
    });

    test("respects maxTokens limit", () => {
      const history: History = [
        { role: "user", content: "The quick brown fox ".repeat(100) },
        { role: "assistant", content: "jumps over the lazy dog. ".repeat(100) },
        { role: "user", content: "Another message ".repeat(100) },
      ];
      const maxTokens = 500;
      const result = truncateHistory(history, maxTokens, model);

      // Calculate approximate total tokens
      let totalTokens = 0;
      for (const msg of result) {
        totalTokens += numTokensUpperBound(msg.content, maxTokens + 100);
      }
      // Should be under or close to the limit
      expect(totalTokens).toBeLessThanOrEqual(maxTokens * 1.2); // Allow 20% buffer
    });

    test("preserves history structure", () => {
      const history: History = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
      ];
      const result = truncateHistory(history, 1000, model);

      expect(result[0]).toHaveProperty("role");
      expect(result[0]).toHaveProperty("content");
      expect(result[1]).toHaveProperty("role");
      expect(result[1]).toHaveProperty("content");
    });
  });

  describe("getMaxTokens", () => {
    test("returns a number for valid models", () => {
      const models = [
        "gpt-4o-8k",
        "gpt-4o-mini-8k",
        "claude-4-5-sonnet-8k",
        "gemini-2.5-flash-8k",
      ];

      for (const model of models) {
        const maxTokens = getMaxTokens(model);
        expect(typeof maxTokens).toBe("number");
        expect(maxTokens).toBeGreaterThan(0);
      }
    });

    test("returns reasonable limits for 8k models", () => {
      const maxTokens = getMaxTokens("gpt-4o-8k");
      // 8k models should have around 8000 tokens
      expect(maxTokens).toBeGreaterThan(7000);
      expect(maxTokens).toBeLessThan(10000);
    });

    test("returns reasonable limits for larger context models", () => {
      // Test with a known 16k model
      const maxTokens = getMaxTokens("gemini-3-flash-preview-16k");
      // 16k models should have around 16000 tokens
      expect(maxTokens).toBeGreaterThan(14000);
      expect(maxTokens).toBeLessThan(20000);
    });
  });

  describe("performance characteristics", () => {
    test("numTokensUpperBound completes quickly on large input", () => {
      const content = "The quick brown fox ".repeat(10000);
      const start = Date.now();
      numTokensUpperBound(content, 4096);
      const elapsed = Date.now() - start;

      // Should complete in reasonable time (less than 500ms)
      expect(elapsed).toBeLessThan(500);
    });

    test("truncateMessage completes quickly", () => {
      const content = "The quick brown fox ".repeat(5000);
      const start = Date.now();
      truncateMessage(content, 1000);
      const elapsed = Date.now() - start;

      // Should complete in reasonable time (less than 500ms)
      expect(elapsed).toBeLessThan(500);
    });

    test("truncateHistory completes quickly with long history", () => {
      const history: History = Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: "The quick brown fox ".repeat(200),
      }));

      const start = Date.now();
      truncateHistory(history, 2000, "gpt-4o-8k");
      const elapsed = Date.now() - start;

      // Should complete in reasonable time (less than 1s)
      expect(elapsed).toBeLessThan(1000);
    });
  });
});
