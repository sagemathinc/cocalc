import { log } from "console";

import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import {
  AnthropicModel,
  GoogleModel,
  // GoogleModel,
  MistralModel,
  isAnthropicModel,
  isGoogleModel,
  isMistralModel,
} from "@cocalc/util/db-schema/llm-utils";
import { evaluateGoogleGenAI, evaluateOpenAI } from "..";
import { getClient } from "../client";
// import { evaluateMistral } from "../mistral";
import { evaluateAnthropic } from "../anthropic";
import { GoogleGenAIClient } from "../google-genai-client";
import { enableModels, setupAPIKeys, test_llm } from "./shared";

beforeAll(async () => {
  await initEphemeralDatabase();
  await setupAPIKeys();
  await enableModels();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

// write a test in jest that fails
test_llm("openai")("OpenAI", () => {
  test("gpt3.5 works", async () => {
    const gpt35 = await getClient("gpt-3.5-turbo");
    if (gpt35 == null) throw new Error("gpt35 is undefined");

    const answer = await evaluateOpenAI({
      client: gpt35 as any,
      model: "gpt-3.5-turbo",
      input: "What's 99 + 1?",
      system: "Reply the value only",
    });

    log("openai answer", answer);

    const { output, total_tokens, completion_tokens, prompt_tokens } = answer;
    expect(output).toContain("100");
    expect(total_tokens).toEqual(prompt_tokens + completion_tokens);
    expect(prompt_tokens).toBeGreaterThan(10);
    expect(completion_tokens).toBeGreaterThan(0);
  });
});

// ATTN: does not work everywhere around, geolocation matters
test_llm("google")("Google GenAI", () => {
  const model: GoogleModel = "gemini-pro";

  test("model", () => {
    expect(isGoogleModel(model)).toBe(true);
  });

  test(
    "gemini works",
    async () => {
      const genAI = await getClient(model);
      if (genAI == null) throw new Error("genAI is undefined");

      const answer = await evaluateGoogleGenAI({
        model,
        client: genAI as any as GoogleGenAIClient,
        input: "What's 99 + 1?",
        system: "Reply the value only",
      });

      log("google answer", answer);

      expect(answer.output).toContain("100");
    },
    10 * 1000,
  );
});

test_llm("mistralai")("Mistral AI", () => {
  const model: MistralModel = "mistral-small-latest";

  test("model", () => {
    expect(isMistralModel(model)).toBe(true);
  });

  // segaults – maybe because we have to forcefully replace a pkg dependency
  test.skip("basics", async () => {
    // const answer = await evaluateMistral({
    //   model,
    //   input: "What's 99 + 1?",
    //   system: "Reply the value only",
    // });
    // expect(answer.output).toContain("100");
    // expect(answer.total_tokens).toEqual(
    //   answer.prompt_tokens + answer.completion_tokens,
    // );
    // expect(answer.prompt_tokens).toBeGreaterThan(10);
    // expect(answer.completion_tokens).toBeGreaterThan(0);
  });
});

test_llm("anthropic")("Anthropic", () => {
  const model: AnthropicModel = "claude-3-haiku";

  test("model", () => {
    expect(isAnthropicModel(model)).toBe(true);
  });

  test("basics", async () => {
    const answer = await evaluateAnthropic({
      model,
      input: "What's 99 + 1?",
      system: "Reply the value only",
    });
    expect(answer.output).toContain("100");
    expect(answer.total_tokens).toEqual(
      answer.prompt_tokens + answer.completion_tokens,
    );
    expect(answer.prompt_tokens).toBeGreaterThan(1);
    expect(answer.completion_tokens).toBeGreaterThan(0);
  });
});
