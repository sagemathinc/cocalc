import { getServerSettings } from "../settings";

export default async function getHelpEmail(): Promise<string> {
  const { help_email } = await getServerSettings(); // that's cached
  if (help_email) {
    return help_email;
  } else {
    throw Error("no help email address set");
  }
}
