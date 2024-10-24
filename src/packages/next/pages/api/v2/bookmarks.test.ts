/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// import { v4 } from "uuid";

// import { createMocks } from "lib/api/test-framework";
// import get from "./bookmarks/get";
// import set from "./bookmarks/set";

// TODO: this does not work at all. That mock does not authenticate with the API, hence you only get an error.

describe("/api/v2/bookmarks", () => {
  // const project_id = v4();

  test("set then get", async () => {
    // const { req, res } = createMocks({
    //   method: "POST",
    //   url: "/api/v2/bookmarks/set",
    //   body: {
    //     type: "starred-files",
    //     project_id,
    //     payload: ["foo.md", "bar.ipynb"],
    //   },
    // });
    // await set(req, res);
    // expect(res.statusCode).toBe(200);
    // console.log(res._getJSONData());
  });
});
