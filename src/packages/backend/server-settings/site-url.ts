import { getServerSettings } from "./server-settings";
import basePath from "@cocalc/backend/base-path";

// Returns url of this site in terms of the base path (determined
// by an env variable when server starts) and the "Domain name"
// setting of site settings.  This URL does NOT end in a /
export default async function siteURL(dns?: string): Promise<string> {
  if (!dns) {
    dns = (await getServerSettings()).dns;
  }
  if (!dns) {
    dns = "localhost";
  }
  return `https://${dns}${basePath == "/" ? "" : basePath}`;
}
