import { create, search, insertMultiple } from "@orama/orama";

interface Document {
  n: number;
  content: string;
}

export default async function searchFilter<T>({
  data,
  toString,
}: {
  data: T[];
  toString: (T) => string;
}) {
  const db = await create({
    schema: {
      content: "string",
    },
  });

  const docs: Document[] = [];
  let n = 0;
  for (const doc of data) {
    docs.push({ n, content: toString(doc) });
    n += 1;
  }

  await insertMultiple(db, docs as any);

  return async (filter: string): Promise<T[]> => {
    const { hits } = await search(db, { term: filter, limit: data.length });
    return hits?.map(({ document }) => data[(document as Document).n]) ?? [];
  };
}
