import { mutagenSync } from "./sync";
import { mutagenForward } from "./forward";
import { type Client } from "@cocalc/conat/core/client";

export default function mutagen({
  client,
  project_id,
  compute_server_id = 0,
}: {
  client: Client;
  project_id: string;
  compute_server_id: number;
}) {
  const opts = { client, project_id, compute_server_id };
  return { sync: mutagenSync(opts), forward: mutagenForward(opts) };
}
