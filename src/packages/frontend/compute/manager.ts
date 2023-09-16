/*
Websocket channel connection to the compute server manager on the backend,
which is implemented starting here:

packages/project/compute/manager.ts
*/

import { WEB_BROWSER_CHANNEL_NAME } from "@cocalc/util/compute/manager";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { reuseInFlight } from "async-await-utils/hof";
import { callback } from "awaiting";

const channelCache: { [project_id: string]: ReturnType<typeof getChannel> } =
  {};

async function getChannel(project_id: string) {
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

class ComputeServerManager {
  private project_id: string;
  private channel: ReturnType<typeof getChannel>;

  constructor(project_id: string) {
    this.project_id = project_id;
  }

  init = async () => {
    this.channel = await getChannel(this.project_id);
  };

  call = async (mesg) => {
    const f = (cb) => {
      this.channel.writeAndWait(mesg, (response) => {
        if (response.event == "error") {
          throw Error(response.message);
        }
        cb(undefined, response);
      });
    };
    return await callback(f);
  };
}

export const manager = reuseInFlight(async (project_id: string) => {
  const m = new ComputeServerManager(project_id);
  await m.init();
  return m;
});

window.x = { manager };
