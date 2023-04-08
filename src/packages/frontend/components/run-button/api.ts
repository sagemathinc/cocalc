import { join } from "path";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";

export default async function api(endpoint: string, args?: object) {
  const url = join(appBasePath, "api/v2/jupyter", endpoint);
  const resp = await (
    await fetch(url, {
      method: args != null ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
      },
      ...(args != null ? { body: JSON.stringify(args) } : undefined),
    })
  ).json();
  if (resp.error) {
    throw Error(resp.error);
  }
  return resp;
}
