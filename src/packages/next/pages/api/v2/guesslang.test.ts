/** @jest-environment node */

import { createMocks } from "lib/api/test-framework";
import handler from "./guesslang";

describe("/api/v2/guesslang", () => {
  test("guess language of some code", async () => {
    const { req, res } = createMocks({
      method: "POST",
      url: "/api/v2/guesslang",
      body: {
        code: "for i in range(10):\n    print(i**2)",
        cutoff: 3,
      },
    });

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const data = res._getJSONData();
    expect(data.result.length).toBe(3);
    expect(data.result[0]).toEqual("py");
  });

  test("default number of responses is 5", async () => {
    const { req, res } = createMocks({
      method: "POST",
      url: "/api/v2/guesslang",
      body: { code: "for i in range(10):\n    print(i**2)" },
    });

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const data = res._getJSONData();
    expect(data.result.length).toBe(5);
  });

  test("error if code not given", async () => {
    const { req, res } = createMocks({
      method: "POST",
      url: "/api/v2/guesslang",
      body: {},
    });

    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  test("error if code is not a string", async () => {
    const { req, res } = createMocks({
      method: "POST",
      url: "/api/v2/guesslang",
      body: { code: 10 },
    });

    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  test("no error if extra param", async () => {
    const cutoff = 7;
    const { req, res } = createMocks({
      method: "POST",
      url: "/api/v2/guesslang",
      body: {
        code: "for i in range(10):\n    print(i**2)",
        foo: "bar",
        cutoff,
      },
    });

    await handler(req, res);
    expect(res.statusCode).toBe(200);
    const data = res._getJSONData();
    expect(data.result.length).toBe(cutoff);
  });
});
