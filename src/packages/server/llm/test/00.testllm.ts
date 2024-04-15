import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import {
  // evaluateGoogleGenAI,
  evaluateOpenAI,
} from "..";
// import { GoogleGenAIClient } from "../google-genai-client";
import {
  enableModels,
  // getGoogleGenAIClient,
  setupAPIKeys,
} from "./shared";

import { isMistralModel } from "@cocalc/util/db-schema/llm-utils";
import { log } from "console";
import { evaluateMistral } from "../mistral";
import { getClient } from "../client";

beforeAll(async () => {
  await initEphemeralDatabase();
  await setupAPIKeys();
  await enableModels();
}, 15000);

afterAll(async () => {
  await getPool().end();
});

// write a test in jest that fails
describe("OpenAI", () => {
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

// ATTN: does not work everywhere, disabled
// describe("Google GenAI", () => {
//   test(
//     "gemini works",
//     async () => {
//       const genAI = await getGoogleGenAIClient("gemini-pro");
//       if (genAI == null) throw new Error("genAI is undefined");

//       log("genAI", genAI);

//       const answer = await evaluateGoogleGenAI({
//         model: "gemini-pro",
//         client: genAI as any as GoogleGenAIClient,
//         input: "What's 99 + 1?",
//         system: "Reply the value only",
//       });

//       log("google answer", answer);

//       expect(answer.output).toContain("100");
//     },
//     10 * 1000,
//   );
// });

describe("Mistral AI", () => {
  const model = "mistral-small-latest";

  test("model", () => {
    expect(isMistralModel(model)).toBe(true);
  });

  test("basics", async () => {
    const answer = await evaluateMistral({
      model,
      input: "What's 99 + 1?",
      system: "Reply the value only",
    });
    expect(answer.output).toContain("100");
    expect(answer.total_tokens).toEqual(
      answer.prompt_tokens + answer.completion_tokens,
    );
    expect(answer.prompt_tokens).toBeGreaterThan(10);
    expect(answer.completion_tokens).toBeGreaterThan(0);
  });
});
