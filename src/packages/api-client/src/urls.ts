import { apiServer, apiBasePath } from "@cocalc/backend/data";
import { join } from "path";

export function siteUrl(path: string): string {
  if (!apiServer) {
    throw Error("API_SERVER must be specified");
  }
  return `${apiServer}${join(apiBasePath, path)}`;
}