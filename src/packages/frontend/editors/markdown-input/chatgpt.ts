import { webapp_client } from "@cocalc/frontend/webapp-client";
import { redux } from "@cocalc/frontend/app-framework";
import { hidden_meta_file } from "@cocalc/util/misc";
import type { ChatActions } from "@cocalc/frontend/chat/actions";

interface Options {
  project_id: string;
  path: string;
  value: string;
}
export default async function chatGPT({
  project_id,
  path,
  value,
}: Options): Promise<void> {
  if (!path.endsWith(".sage-chat")) {
    path = hidden_meta_file(path, "sage-chat");
  }
  const actions = redux.getEditorActions(
    project_id,
    path
  ) as ChatActions | null;
  if (actions?.syncdb == null) {
    // hackish
    // chat not opened/available
    return;
  }
  // strip mentions
  value = stripMentions(value);
  // submit question to chatgpt
  const resp = await webapp_client.openai_client.chatgpt(value);
  // insert the answer as a new chat message
  if (actions?.syncdb != null) {
    //hackish
    actions.send_chat(resp, "chatgpt");
  }
}

function stripMentions(value: string): string {
  // They look like this ... <span class="user-mention" account-id=chatgpt >@ChatGPT</span> ...
  while (true) {
    const i = value.indexOf('<span class="user-mention"');
    if (i == -1) return value;
    const j = value.indexOf("</span>", i);
    if (j == -1) return value;
    value = value.slice(0, i) + value.slice(j + "</span>".length);
  }
}
