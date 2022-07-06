import type { Request } from "express";

export default function getParams(req: Request): { [param: string]: any } {
  if (req?.method == "POST") {
    return new Proxy(
      {},
      {
        get(_, key) {
          return req.body?.[key];
        },
      }
    );
  } else if (req?.method == "GET") {
    return new Proxy(
      {},
      {
        get(_, key) {
          if (typeof key != "string") {
            return undefined;
          }
          return req.query?.[key];
        },
      }
    );
  } else {
    // only have params for GET and POST requests.
    return {};
  }
}
