import { getServerSettings } from "./server-settings";
import basePath from "@cocalc/backend/base-path";

// Returns url of this site in terms of the base path (determined
// by an env variable when server starts) and the "Domain name"
// setting of site settings.  This URL does NOT end in a /
export default async function siteURL(): Promise<string> {
  const { dns } = await getServerSettings();
  if (!dns) {
    throw Error(
      "The administrator of this site must configure the Domain Name in site settings."
    );
  }
  return `https://${dns}${basePath == "/" ? "" : basePath}`;
}
