import { getEnv } from "./env";
import { PubSub } from "@cocalc/nats/sync/pubsub";
import { project_id } from "@cocalc/project/data";

export default async function pubsub({
  path,
  name,
}: {
  path?: string;
  name: string;
}) {
  return new PubSub({ env: await getEnv(), project_id, path, name });
}
