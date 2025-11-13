/* Get the actions for a side chat.  This will try to open the
chat as well and waits until the state is ready. */

import { delay } from "awaiting";

import type { ChatActions } from "@cocalc/frontend/chat/actions";
import { meta_file } from "@cocalc/util/misc";

export default async function getChatActions(
  redux,
  project_id: string,
  path: string,
  maxWaitSeconds: number = 10,
  width: number = 0.7
): Promise<ChatActions> {
  const projectActions = redux.getProjectActions(project_id);
  projectActions.open_chat({ path, width });
  const start = Date.now();

  while (Date.now() - start <= 1000 * maxWaitSeconds) {
    const chatActions = redux.getEditorActions(
      project_id,
      meta_file(path, "chat")
    ) as ChatActions;
    if (chatActions?.syncdb?.get_state() == "ready") {
      return chatActions;
    }
    await delay(200);
  }
  throw Error("unable to open chatroom");
}
