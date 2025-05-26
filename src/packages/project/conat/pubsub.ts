import { getEnv } from "./env";
import { PubSub } from "@cocalc/conat/sync/pubsub";
import { project_id } from "@cocalc/project/data";

export default async function pubsub({
  path,
  name,
}: {
  path?: string;
  name: string;
}) {
  return new PubSub({ client: (await getEnv()).cn, project_id, path, name });
}
