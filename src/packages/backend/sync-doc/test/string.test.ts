import { syncstring } from "@cocalc/backend/sync-doc/doc";

describe("working with a string", () => {
  let s;
  it("creates a syncstring", async () => {
    s = await syncstring({});
  });

  it("cleans up", () => {
    s.close();
  });
});
