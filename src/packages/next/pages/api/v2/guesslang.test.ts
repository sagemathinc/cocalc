import { createRequest, createResponse } from "node-mocks-http";
import handler from "./guesslang";
import type { NextApiRequest, NextApiResponse } from "next";

function createMocks(x, y?) {
  const req = createRequest<NextApiRequest>({
    headers: { "content-type": "application/json" },
    ...x,
  });
  const res = createResponse<NextApiResponse>(y);
  return { req, res };
}

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
});
