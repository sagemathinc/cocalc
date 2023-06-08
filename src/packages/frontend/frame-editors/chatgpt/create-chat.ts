import { backtickSequence } from "@cocalc/frontend/markdown/util";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { capitalize } from "@cocalc/util/misc";
import type { Model } from "@cocalc/util/db-schema/openai";
import { OPENAI_USERNAMES } from "@cocalc/util/db-schema/openai";

interface Options {
  codegen?: boolean;
  command: string;
  allowEmpty?: boolean;
  tag?: string;
  model: Model;
}

export default async function createChat({
  actions,
  frameId,
  options,
  input,
}: {
  actions;
  frameId: string;
  options: Options;
  input?: string;
}): Promise<void> {
  let { codegen, command, allowEmpty, model, tag } = options;
  const frameType = actions._get_frame_type(frameId);
  if (frameType == "terminal") {
    input = "";
    allowEmpty = true;
    codegen = false;
  } else {
    if (input == null) {
      input = actions.chatgptGetContext();
    }
    if (!input && !allowEmpty) {
      throw Error("Please write or select something.");
    }
  }
  if (input == null) {
    throw Error("bug");
  }
  // Truncate input (also this MUST lazy import):
  const { truncateMessage, getMaxTokens } = await import(
    "@cocalc/frontend/misc/openai"
  );
  const maxTokens = getMaxTokens(model) - 1000; // 1000 tokens reserved for output and the prompt below.
  input = truncateMessage(input, maxTokens);

  const chatActions = await getChatActions(
    actions.redux,
    actions.project_id,
    actions.path
  );
  const delim = backtickSequence(input);
  const head = `<span class="user-mention" account-id=${
    model == "gpt-4" ? "chatgpt4" : "chatgpt"
  }>@${OPENAI_USERNAMES[model] ?? model}</span> ${capitalize(command)}:\n`;
  let message = "";
  if (frameType != "terminal") {
    message += `I am writing in the file ${
      actions.path
    } ${actions.chatgptExtraFileInfo()}.`;
    if (input.trim()) {
      message += ` The file includes the following ${
        codegen ? "code" : "content"
      }:`;
      message += `
${delim}${actions.chatgptGetLanguage()}
${input.trim()}
${delim}
${codegen && input.trim() ? "Show the new version." : ""}`;
    }
  } else {
    message += ". I am using the bash Ubuntu Linux terminal in CoCalc.";
  }
  // scroll to bottom *after* the message gets sent.
  setTimeout(() => chatActions.scrollToBottom(), 100);
  if (message.includes("<details")) {
    message = `${head}\n\n${message}`;
  } else {
    message = `${head}\n\n<details><summary>Context</summary>\n\n${message}\n\n</details>`;
  }
  await chatActions.send_chat({
    input: message,
    tag: `code-editor-${tag ?? command}`,
    noNotification: true,
  });
}
