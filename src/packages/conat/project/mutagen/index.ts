import { mutagenSync } from "./sync";
import { mutagenForward } from "./forward";
import { type Client } from "@cocalc/conat/core/client";

export default function mutagen({
  client,
  project_id,
}: {
  client: Client;
  project_id: string;
}) {
  const opts = { client, project_id };
  return { sync: mutagenSync(opts), forward: mutagenForward(opts) };
}
