import getClient from "./client";

export default async function embeddings(input: string[]): Promise<number[][]> {
  const openai = await getClient();
  const response = await openai.createEmbedding({
    model: "text-embedding-ada-002",
    input,
  });
  return response.data.data.map((x) => x.embedding);
}
