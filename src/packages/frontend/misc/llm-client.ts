import { Ollama } from "@langchain/community/llms/ollama";

import { ChatStream } from "../client/llm";

interface Opts {
  model: string;
  input: string;
  system?: string;
  history?: History;
  project_id?: string;
  path?: string;
  chatStream?: ChatStream;
}

export async function queryClientLLM(opts: Readonly<Opts>): Promise<string> {
  const { input, history, system, model, chatStream } = opts;
  console.log({ input, history, system, model, chatStream });

  const ollama = new Ollama({
    baseUrl: "http://localhost:11434", // Default value
    model: "llama2", // Default value
  });

  const stream = await ollama.stream(
    `Translate "I love programming" into German.`,
  );

  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return chunks.join("");
}
