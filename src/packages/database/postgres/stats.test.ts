// to access the non-exported RESERVED object
process.env["NODE_DEV"] = "TEST";

import * as stats from "@cocalc/database/postgres/stats";

test("query", () => {
  const countQuery = (stats as any)._count_opened_files_query;
  const q = countQuery(true);
  expect(q.indexOf("'sage-chat'")).toBeGreaterThan(0);
  expect(q.indexOf("'chat'")).toBeGreaterThan(0);
  expect(q.indexOf("SELECT DISTINCT")).toBeGreaterThan(0);

  const q2 = countQuery(false);
  expect(q2.indexOf("'slides'")).toBeGreaterThan(0);
  expect(q2.indexOf("SELECT  event")).toBeGreaterThan(0);
});
