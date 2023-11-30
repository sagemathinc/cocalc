import { apiServer } from "@cocalc/backend/data";

export function siteUrl(path: string): string {
  if (!apiServer) {
    throw Error("API_SERVER must be specified");
  }
  return `${apiServer}/${path}`;
}
