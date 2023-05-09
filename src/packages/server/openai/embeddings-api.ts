import * as embeddings from "./embeddings";
import { isValidUUID, is_array } from "@cocalc/util/misc";

const MAX_SEARCH_INPUT = 2000;
const MAX_SEARCH_LIMIT = 100;
export function validateSearchParams({ input, filter, limit }) {
  if (typeof input != "string") {
    throw Error("input must be a string");
  }
  if (!input.trim()) {
    throw Error("input must not be whitespace");
  }
  if (input.length > MAX_SEARCH_INPUT) {
    // hard limit on size for *search*.
    throw Error(`input must be at most ${MAX_SEARCH_INPUT} characters`);
  }
  if (filter != null && typeof filter != "object") {
    throw Error("if filter is not null it must be an object");
  }
  if (typeof limit != "number") {
    throw Error("limit must be a number");
  }
  if (limit <= 0 || limit > MAX_SEARCH_LIMIT) {
    throw Error(`limit must be a positive number up to ${MAX_SEARCH_LIMIT}`);
  }
}

export async function search({
  account_id,
  input,
  limit,
  filter,
}: {
  account_id: string;
  input: string;
  limit: number;
  filter?: object;
}): Promise<embeddings.Result[]> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  validateSearchParams({ input, filter, limit });
  return await embeddings.search({ input, limit, filter });
}

export function validateData(data) {
  if (!is_array(data)) {
    throw Error("data must be an array");
  }
  for (const datum of data) {
    const { payload, field } = datum;
    if (typeof payload != "object") {
      throw Error("each datum must have a payload object");
    }
    if (typeof field != "string") {
      throw Error("each datum must have a field string");
    }
    if (typeof payload[field] != "string" || !payload[field]) {
      throw Error("each datum must payload[field] a nontrivial string");
    }
  }
}

export async function save({
  account_id,
  data,
}: {
  account_id: string;
  data: embeddings.Data[];
}) : Promise<string[]> {
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  validateData(data);
  return await embeddings.save(data);
}
