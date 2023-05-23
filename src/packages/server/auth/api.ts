import { Request } from "express";
import { split } from "@cocalc/util/misc";
import { getAccountWithApiKey } from "@cocalc/server/api/manage";

export function getApiKey(req: Request): string {
  const h = req.header("Authorization");
  if (h == null) {
    throw Error("You must provide authentication via an API key.");
  }
  const [type, user] = split(h);
  switch (type) {
    case "Bearer":
      return user;
    case "Basic":
      return Buffer.from(user, "base64").toString().split(":")[0];
  }
  throw Error(`Unknown authorization type '${type}'`);
}

export async function getAccountIdFromApiKey(
  req: Request
): Promise<string | undefined> {
  return await getAccountWithApiKey(getApiKey(req));
}
