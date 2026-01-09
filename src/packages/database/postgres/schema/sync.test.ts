/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { schemaNeedsSync } from "./sync";
import { createIndexesQueries } from "./indexes";
import { SCHEMA } from "@cocalc/util/schema";
import type { DBSchema } from "./types";
import { getClient } from "@cocalc/database/pool";

jest.mock("@cocalc/database/pool", () => ({
  __esModule: true,
  getClient: jest.fn(),
}));

type ColumnRow = {
  column_name: string;
  data_type: string;
  character_maximum_length?: number | null;
};

type QueryResult = { rows: Array<Record<string, any>> };

type MockClient = {
  connect: jest.Mock;
  end: jest.Mock;
  query: jest.Mock<Promise<QueryResult>, [string, ...any[]]>;
};

const openaiSchema: DBSchema = {
  openai_embedding_cache: SCHEMA.openai_embedding_cache,
};

const openaiColumns: ColumnRow[] = [
  {
    column_name: "input_sha1",
    data_type: "character",
    character_maximum_length: 40,
  },
  {
    column_name: "vector",
    data_type: "ARRAY",
  },
  {
    column_name: "model",
    data_type: "text",
  },
  {
    column_name: "expire",
    data_type: "timestamp without time zone",
  },
];

const openaiIndexRows = createIndexesQueries(SCHEMA.openai_embedding_cache).map(
  ({ name }) => ({ name }),
);

const openaiPrimaryKeyRows = [{ name: "input_sha1" }];

const registrationTokensSchema: DBSchema = {
  registration_tokens: SCHEMA.registration_tokens,
};

const registrationTokensColumns: ColumnRow[] = [
  { column_name: "token", data_type: "text" },
  { column_name: "descr", data_type: "text" },
  { column_name: "counter", data_type: "double precision" },
  { column_name: "expires", data_type: "timestamp without time zone" },
  { column_name: "limit", data_type: "double precision" },
  { column_name: "disabled", data_type: "boolean" },
  { column_name: "ephemeral", data_type: "double precision" },
  { column_name: "customize", data_type: "jsonb" },
];

const registrationTokensIndexRows = createIndexesQueries(
  SCHEMA.registration_tokens,
).map(({ name }) => ({ name }));

const registrationTokensPrimaryKeyRows = [{ name: "token" }];

function createMockClient(options: {
  tableName: string;
  columnRows: ColumnRow[];
  indexRows: Array<{ name: string }>;
  primaryKeyRows: Array<{ name: string }>;
}): MockClient {
  const { tableName, columnRows, indexRows, primaryKeyRows } = options;

  const query = jest.fn(async (text: string) => {
    if (text.includes("SELECT EXISTS") && text.includes("compute_servers")) {
      return { rows: [{ exists: false }] };
    }
    if (text.includes("SELECT tablename FROM pg_tables")) {
      return { rows: [{ tablename: tableName }] };
    }
    if (text.includes("FROM information_schema.columns")) {
      return { rows: columnRows };
    }
    if (text.includes("FROM pg_class AS a JOIN pg_index AS b")) {
      return { rows: indexRows };
    }
    if (text.includes("FROM   pg_index i")) {
      return { rows: primaryKeyRows };
    }
    throw new Error(`Unexpected query: ${text}`);
  });

  return {
    connect: jest.fn().mockResolvedValue(undefined),
    end: jest.fn().mockResolvedValue(undefined),
    query,
  };
}

describe("schemaNeedsSync column actions", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns false when array column types match the schema", async () => {
    const client = createMockClient({
      tableName: "openai_embedding_cache",
      columnRows: openaiColumns,
      indexRows: openaiIndexRows,
      primaryKeyRows: openaiPrimaryKeyRows,
    });
    (getClient as jest.Mock).mockReturnValue(client);

    const result = await schemaNeedsSync(openaiSchema);

    expect(result).toBe(false);
  });

  it("returns true when a non-array column type mismatches", async () => {
    const columnRows = openaiColumns.map((row) =>
      row.column_name === "model" ? { ...row, data_type: "integer" } : row,
    );
    const client = createMockClient({
      tableName: "openai_embedding_cache",
      columnRows,
      indexRows: openaiIndexRows,
      primaryKeyRows: openaiPrimaryKeyRows,
    });
    (getClient as jest.Mock).mockReturnValue(client);

    const result = await schemaNeedsSync(openaiSchema);

    expect(result).toBe(true);
  });

  it("returns false when double precision types match number fields", async () => {
    const client = createMockClient({
      tableName: "registration_tokens",
      columnRows: registrationTokensColumns,
      indexRows: registrationTokensIndexRows,
      primaryKeyRows: registrationTokensPrimaryKeyRows,
    });
    (getClient as jest.Mock).mockReturnValue(client);

    const result = await schemaNeedsSync(registrationTokensSchema);

    expect(result).toBe(false);
  });
});
