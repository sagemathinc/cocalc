import getPool, { initEphemeralDatabase } from "@cocalc/database/pool";
import { syncSchema } from "@cocalc/database/postgres/schema";
import { SCHEMA } from "@cocalc/util/schema";

function expectedTables(): string[] {
  return Object.values(SCHEMA)
    .filter((schema) => {
      if (!schema) return false;
      if (schema.virtual) return false;
      if (schema.external) return false;
      if (schema.durability === "ephemeral") return false;
      return true;
    })
    .map((schema) => schema.name);
}

beforeAll(async () => {
  await initEphemeralDatabase({ reset: true });
}, 30000);

afterAll(async () => {
  await getPool().end();
});

test("syncSchema creates all managed tables", async () => {
  await syncSchema();
  const { rows } = await getPool().query(
    "SELECT tablename FROM pg_tables WHERE schemaname='public'",
  );
  const actual = new Set(rows.map((row) => row.tablename));
  for (const table of expectedTables()) {
    expect(actual.has(table)).toBe(true);
  }
});
