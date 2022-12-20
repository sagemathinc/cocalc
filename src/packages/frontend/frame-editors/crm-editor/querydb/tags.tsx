import { createContext, useContext, useMemo } from "react";
import { useTable } from "./table-hook";
import { getTableDescription } from "../tables";
import { IconName } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";

interface Tag {
  id: number;
  name: string;
  color?: string;
  icon?: IconName;
  description?: string;
}

type TagMap = { [id: number]: Tag };

export interface TagsContextType {
  tags: TagMap | null;
}

export const TagsContext = createContext<TagsContextType>({ tags: null });

export function TagsProvider({ children }) {
  const { query } = useMemo(() => getTableDescription("tags"), []);
  const { data, editableContext } = useTable({ query, changes: true });

  const tags = useMemo(() => {
    // some tags have changed, so update our tags map
    const v: TagMap = {};
    for (const x of data) {
      v[x.id] = x;
    }
    return v;
  }, [data, editableContext.counter]);

  return (
    <TagsContext.Provider value={{ tags }}>{children}</TagsContext.Provider>
  );
}

export function useTags() {
  const context = useContext(TagsContext);
  return context.tags;
}

export async function getTagId(name: string): Promise<number> {
  const { query } = getTableDescription("tags");
  const dbtable = Object.keys(query)[0];
  // Figure out the id it as assigned
  const x = await webapp_client.query_client.query({
    query: { [dbtable]: { name, id: null } },
  });
  const id = x.query[dbtable]?.id;
  if (id == null) {
    throw Error("failed to create tag");
  }
  return id;
}

// create a new tag and return its id (or returns existing id if already exists)
export async function createTag(name: string): Promise<number> {
  try {
    return await getTagId(name);
  } catch (_) {}
  const { query } = getTableDescription("tags");
  const dbtable = Object.keys(query)[0];
  // First create it
  await webapp_client.query_client.query({
    query: { [dbtable]: { name, last_edited: "NOW()", created: "NOW()" } },
  });
  return await getTagId(name);
}
