import * as embeddings from "./embeddings";
import { isValidUUID, is_array } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import type { EmbeddingData } from "@cocalc/util/db-schema/openai";

const MAX_SEARCH_TEXT = 4000; // *technical* it would be 8K tokens...
const MAX_SEARCH_LIMIT = 500;
function validateSearchParams({ text, filter, limit, selector, offset }) {
  if (text != null) {
    if (typeof text != "string") {
      throw Error("text must be a string");
    }
    if (!text.trim()) {
      throw Error("text must not be whitespace");
    }
    if (text.length > MAX_SEARCH_TEXT) {
      // hard limit on size for *search*.
      throw Error(`text must be at most ${MAX_SEARCH_TEXT} characters`);
    }
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
  if (offset != null) {
    if (typeof offset == "number") {
      if (offset < 0) {
        throw Error("offset must be nonnegative integer or uuid");
      }
    } else if (typeof offset == "string") {
      if (!isValidUUID(offset)) {
        throw Error("offset must be nonnegative integer or uuid");
      }
    }
    if (text != null && typeof offset != "number") {
      throw Error("offset must be a number when doing a vector search");
    }
  }
  if (selector != null) {
    if (typeof selector != "object") {
      throw Error(
        "selector must object of the form  { include?: string[]; exclude?: string[] }"
      );
    }
  }
}

export async function search({
  account_id,
  scope,
  text,
  limit,
  filter: filter0,
  selector,
  offset,
}: {
  account_id: string;
  scope: string | string[];
  text?: string;
  limit: number;
  filter?: object;
  selector?: { include?: string[]; exclude?: string[] };
  offset?: number | string;
}): Promise<embeddings.Result[]> {
  // [ ] TODO: Get n most recent non-hidden/non-deleted projects for this account, and add
  // a filter to only get results matching them.
  // [ ] TODO: CRITICAL security check -- need to make sure the filter explicitly contains
  //     only project(s) user has access to, or some other url's later (e.g., for searching share server).
  const filter = await scopeFilter(account_id, scope, filter0);
  validateSearchParams({ text, filter, limit, selector, offset });
  return await embeddings.search({ text, limit, filter, selector, offset });
}

// Creates filter object that further restricts input filter to also have the given scope.
// The scope restricts to only things this user is allowed to see.
// It is just an absolute url path (or array of them) to the cocalc server.
// E.g., if it is "projects/10f0e544-313c-4efe-8718-2142ac97ad11/files/cocalc" that means
// the scope is files in the cocalc directory of the project with id projects/10f0e544-313c-4efe-8718-2142ac97ad11
// If it is "share", that means anything on the share server, etc. (so anybody can read -- we don't include unlisted).
// This throws an error if the scope isn't sufficient, user doesn't exist,
// request for projects they don't collab on, etc.
// NOTE: in the database we always make the first character of payload.url a single backslash,
// so that we can do prefix searches, which don't exist in qdrant.
async function scopeFilter(
  account_id: string,
  scope: string | string[],
  filter: object = {}
): Promise<object> {
  if (typeof scope != "string" && !is_array(scope)) {
    throw Error("scope must be a string or string[]");
  }
  if (typeof scope == "string") {
    scope = [scope];
  }

  const should: any[] = [];
  const knownProjects = new Set<string>(); // efficiency hack
  for (const s of scope) {
    if (typeof s != "string" || !s) {
      throw Error("each entry in the scope must be a nonempty string");
    }
    if (s.includes("\\")) {
      throw Error("scope may not include backslashes");
    }
    if (s.startsWith("projects/")) {
      // a project -- parse the project_id and confirm access
      const v = s.split("/");
      const project_id = v[1];
      if (
        !knownProjects.has(project_id) &&
        !(await isCollaborator({ project_id, account_id }))
      ) {
        throw Error(
          `must be a collaborator on the project with id '${project_id}'`
        );
      }
      knownProjects.add(project_id);
    } else if (s == "share" || s == "share/") {
      // ok
    } else {
      throw Error(`scope "${s}" not supported`);
    }
    // no error above, so this is a prefix search
    // TODO [ ]: make appropriate index on url text field.
    should.push({ key: "url", match: { text: "\\" + s } });
  }
  if (filter["should"]) {
    filter["should"] = [...should, ...filter["should"]];
  } else {
    filter["should"] = should;
  }
  return filter;
}

/*
Prepare data for saving or deleting from database.
- We check that the account_id is a valid collab on project_id.
- We ensure data[i].payload is an object for each i.
- If needsField is true, then we also ensure data[i].field is set and provides a valid field into the payload.
*/
async function prepareData(
  account_id: string,
  project_id: string,
  path: string,
  data: EmbeddingData[],
  needsText: boolean
): Promise<embeddings.Data[]> {
  if (!is_array(data)) {
    throw Error("data must be an array");
  }
  if (!(await isCollaborator({ account_id, project_id }))) {
    // check that account_id is collab on project_id
    throw Error(`user must be collaborator on project with id ${project_id}`);
  }
  const url = toURL({ project_id, path });
  const data2: embeddings.Data[] = [];
  for (const { id, text, meta, hash } of data) {
    if (!id || typeof id != "string") {
      throw Error(
        "you must specify the id for each item and it must be a nonempty string"
      );
    }
    if (needsText) {
      if (!text || typeof text != "string") {
        throw Error("each item must have an nonempty text string");
      }
    }
    data2.push({
      field: "text",
      payload: {
        text,
        url: `${url}#${id}`,
        hash,
        meta,
      },
    });
  }
  return data2;
}

function toURL({ project_id, path }) {
  return `\\projects/${project_id}/files/${path}`;
}

export async function save({
  account_id,
  project_id,
  path,
  data,
}: {
  account_id: string;
  project_id: string;
  path: string;
  data: EmbeddingData[];
}): Promise<string[]> {
  if (data.length == 0) {
    // easy
    return [];
  }
  // [ ] todo: record in database effort accrued due to account_id.

  const data2: embeddings.Data[] = await prepareData(
    account_id,
    project_id,
    path,
    data,
    true
  );
  return await embeddings.save(data2);
}

// Permanently delete points from vector store that match
export async function remove({
  account_id,
  project_id,
  path,
  data,
}: {
  account_id: string;
  project_id: string;
  path: string;
  data: EmbeddingData[];
}): Promise<string[]> {
  if (data.length == 0) {
    // easy
    return [];
  }

  const data2 = await prepareData(account_id, project_id, path, data, false);
  return await embeddings.remove(data2);
}

// get payload of points from vector store that match
export async function get({
  account_id,
  project_id,
  path,
  data,
  selector,
}: {
  account_id: string;
  project_id: string;
  path: string;
  data: EmbeddingData[];
  selector?: { include?: string[]; exclude?: string[] };
}): Promise<{ id: string | number; payload: object }[]> {
  if (data.length == 0) {
    // easy
    return [];
  }
  const data2 = await prepareData(account_id, project_id, path, data, false);
  return await embeddings.getPayloads(
    data2.map(({ payload }) => embeddings.getPointId(payload?.url as string)),
    selector
  );
}
