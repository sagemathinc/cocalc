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
    /*
    // Disabled, since this could lead to a sneaky click on a link attack.
    // Should only be enabled for dev purposes.
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
*/
  } else {
    // only support params for POST requests.
    return {};
  }
}
