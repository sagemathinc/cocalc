/** @jest-environment node */

/*
This file gets unit tested both in prod and dev modes.  This is important to
ensure that in production the input validation is skipped (for now!).
*/

import handler from "../../pages/api/v2/guesslang";
import { createMocks } from "./test-framework";

describe("test that /api/v2/guesslang works in either dev or production mode", () => {
  test("error if code param not given in dev mode; no error in production mode", async () => {
    const { req, res } = createMocks({
      method: "POST",
      url: "/api/v2/guesslang",
      body: {},
    });

    await handler(req, res);
    if (process.env.NODE_ENV == "production") {
      expect(res.statusCode).toBe(200);
    } else {
      expect(res.statusCode).toBe(400);
    }
  });

  test("error if code is not a string in dev mode; no error in production mode", async () => {
    const { req, res } = createMocks({
      method: "POST",
      url: "/api/v2/guesslang",
      body: { code: 10 },
    });

    await handler(req, res);
    if (process.env.NODE_ENV == "production") {
      expect(res.statusCode).toBe(200);
    } else {
      expect(res.statusCode).toBe(400);
    }
  });
});
