import type { Request } from "express";

export default function getParams(req: Request): { [param: string]: any } {
  if (req?.method == "POST") {
    return new Proxy(
      {},
      {
        get(_, key) {
          return req.body?.[key];
        },
      },
    );
  } else {
    // only support params for POST requests.
    return {};
  }
}
