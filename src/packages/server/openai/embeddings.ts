/*
Determine embeddings of an array of input strings.

- For each string we compute the sha1 hash of it
- For each string where the sha1 hash was already computed, we grab the vector from Qdrant.
    - We're not worrying about hash collisions, given how unlikely they are and that our
      application is to fuzzy AI search and context inclusion, so if there is a one in
      a billion hash collision, the impact is minimal.
- For all strings where the sha1 hash was NOT known, we send them to openai and get
  their embedding vectors.
    - We truncate each input string at 8192 tokens, since otherwise we'll get an error
      from chatgpt. Do this by splitting at 81920 say characters, then tokenizing, then slicing,
      and sending the tokens to chatgpt (so they don't have to do tokenize again).
      Clients shouldn't send text that is too long, but we just handle it.
    - We then store the resulting vectors in Qdrant.
    - We store the fact we know the vectors in the openai_embedding_log table in postgres.

Note: we never want to give vectors back to clients. They get computed when not known and
immediately stored in Qdrant.  When we later do searches or similarity, we refer to the
vector for the search by id (as explained here: https://qdrant.tech/documentation/search/#search-api)

I'm not 100% sure if the input text should be stored in postgres or just the sha1's.
The advantage of storing the text is we could recompute all embeddings if we needed
to, e.g., to use a different model or due to data loss.  The disadvantage is it would
waste a lot of space. Also, we very likely do want to the text to be in Qdrant, so
we can filter on it too (e.g., to add in keyword search if we want?).  I'm not sure.
*/

import getClient from "./client";
//import getPool from "@cocalc/database/pool";

export default async function embeddings(input: string[]): Promise<number[][]> {
  const openai = await getClient();
  const response = await openai.createEmbedding({
    model: "text-embedding-ada-002",
    input,
  });
  return response.data.data.map((x) => x.embedding);
}
