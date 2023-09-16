/*
Websocket channel connection to the compute server manager on the backend,
which is implemented starting here:

packages/project/compute/manager.ts
*/

import { WEB_BROWSER_CHANNEL_NAME } from "@cocalc/util/compute/manager";
import { webapp_client } from "@cocalc/frontend/webapp-client";

const channelCache: { [project_id: string]: ReturnType<typeof getChannel> } =
  {};

export async function getChannel(project_id: string) {
  if (!project_id) {
    throw Error("project_id must be given");
  }
  if (channelCache[project_id] != null) {
    return channelCache[project_id];
  }
  const ws = await webapp_client.project_client.websocket(project_id);
  const channel = ws.channel(WEB_BROWSER_CHANNEL_NAME);
  channel.on("data", (data) => {
    console.log("GOT ", data);
  });
  channelCache[project_id] = channel;
  return channel;
}
