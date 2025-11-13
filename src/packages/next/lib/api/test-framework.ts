// This is for unit testing.

import { createRequest, createResponse } from "node-mocks-http";
import type { NextApiRequest, NextApiResponse } from "next";

export function createMocks(x, y?) {
  const req = createRequest<NextApiRequest>({
    headers: { "content-type": "application/json" },
    ...x,
  });
  const res = createResponse<NextApiResponse>(y);
  return { req, res };
}
