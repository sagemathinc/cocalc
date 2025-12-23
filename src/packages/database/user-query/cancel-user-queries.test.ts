/*
 *  This file is part of CoCalc: Copyright © 2020–2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { db } from "@cocalc/database";

describe("cancel_user_queries", () => {
  let database: any;

  beforeAll(() => {
    database = db({ connect: false, ensure_exists: false });
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
