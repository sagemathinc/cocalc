import type { Request } from "express";

export default function getParams(
  req: Request,
  { allowGet }: { allowGet?: boolean } = {}
): { [param: string]: any } {
  if (req?.method == "POST") {
    return new Proxy(
      {},
      {
        get(_, key) {
          return req.body?.[key];
        },
      }
    );
  } else if (allowGet && req?.method == "GET") {
    // allowGet is NOT enabled by default, since this could lead to a sneaky click on a link attack.
    // Should only be enabled for dev purposes or for specific endpoints where making the api call
    // doesn't potential leak private information.
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
    // only support params for POST requests.
    return {};
  }
}
