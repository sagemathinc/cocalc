import { connectToConat } from "./connection";
import { PubSub } from "@cocalc/conat/sync/pubsub";
import { project_id } from "@cocalc/project/data";

export default async function pubsub({
  path,
  name,
}: {
  path?: string;
  name: string;
}) {
  return new PubSub({ client: await connectToConat(), project_id, path, name });
}
