/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";
import { initEphemeralDatabase } from "@cocalc/database/pool";
import { testCleanup } from "@cocalc/database/test-utils";

describe("cancel_user_queries", () => {
  let database: any;

  beforeAll(async () => {
    await initEphemeralDatabase({});
    database = db();
  });

  afterAll(async () => {
    await testCleanup(database);
  });

  it("forwards to the query queue when present", () => {
    const cancel = jest.fn();
    database._user_query_queue = { cancel_user_queries: cancel };

    database.cancel_user_queries({ client_id: "client-1" });

    expect(cancel).toHaveBeenCalledWith({ client_id: "client-1" });
  });

  it("no-ops when there is no query queue", () => {
    database._user_query_queue = undefined;

    expect(() =>
      database.cancel_user_queries({ client_id: "client-2" }),
    ).not.toThrow();
  });
});
