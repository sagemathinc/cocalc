import * as embeddings from "./embeddings";
import { isValidUUID, is_array } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

const MAX_SEARCH_INPUT = 2000;
const MAX_SEARCH_LIMIT = 100;
function validateSearchParams({ input, filter, limit }) {
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
  // [ ] TODO: Get n most recent non-hidden/non-deleted projects for this account, and add
  // a filter to only get results matching them.
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  validateSearchParams({ input, filter, limit });
  return await embeddings.search({ input, limit, filter });
}

async function validateData(
  data: embeddings.Data[],
  account_id: string,
  needsField: boolean
) {
  if (!is_array(data)) {
    throw Error("data must be an array");
  }
  // checks that account_id is collab on project_id
  const data2: embeddings.Data[] = [];
  const knownProjects = new Set<string>();
  for (const x of data) {
    const { payload, field } = x;
    if (payload == null || typeof payload != "object") {
      throw Error("each datum must have a payload object");
    }
    if (needsField) {
      if (typeof field != "string") {
        throw Error("each datum must have a field string");
      }
      if (typeof payload[field] != "string" || !payload[field]) {
        throw Error("each datum must payload[field] a nontrivial string");
      }
    }

    const { project_id } = payload as any;
    if (!knownProjects.has(project_id)) {
      if (!(await isCollaborator({ project_id, account_id }))) {
        throw Error(
          "project_id must be specified and user must be a collab on that project"
        );
      } else {
        knownProjects.add(project_id);
      }
    }
    data2.push({ ...x, point_id: toPointId(x.payload as any) });
  }
  return data2;
}

function toPointId({ project_id, path, fragment_id }): string {
  return embeddings.getPointId(
    `/projects/${project_id}/files/${path}#${fragment_id}`
  );
}

export async function save({
  account_id,
  data,
}: {
  account_id: string;
  data: embeddings.Data[];
}): Promise<string[]> {
  if (data.length == 0) {
    // easy
    return [];
  }
  // [ ] todo: record in database effort accrued due to account_id.

  const data2 = await validateData(data, account_id, true);

  return await embeddings.save(data2);
}

// Remove points from vector store that match
export async function remove({
  account_id,
  data,
}: {
  account_id: string;
  data: embeddings.Data[];
}): Promise<string[]> {
  const data2 = await validateData(data, account_id, false);
  return await embeddings.remove(data2);
}

// get payload of points from vector store that match
export async function get({
  account_id,
  data,
  selector,
}: {
  account_id: string;
  data: embeddings.Data[];
  selector?: { include?: string[]; exclude?: string[] };
}): Promise<{ id: string | number; payload: object }[]> {
  const data2 = await validateData(data, account_id, false);
  return await embeddings.getPayloads(
    data2.map(({ point_id }) => point_id),
    selector
  );
}
