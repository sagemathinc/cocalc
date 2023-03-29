import { backtickSequence } from "@cocalc/frontend/markdown/util";
import getChatActions from "@cocalc/frontend/chat/get-actions";
import { capitalize } from "@cocalc/util/misc";

interface Options {
  codegen?: boolean;
  command: string;
  allowEmpty?: boolean;
  tag?: string;
}

export default async function createChat({
  actions,
  frameId,
  options,
}: {
  actions;
  frameId: string;
  options: Options;
}): Promise<void> {
  let { codegen, command, allowEmpty, tag } = options;
  const frameType = actions._get_frame_type(frameId);
  let input;
  if (frameType == "terminal") {
    input = "";
    allowEmpty = true;
    codegen = false;
  } else {
    input = actions.chatgptGetText(frameId, "selection");
    if (!input) {
      input = actions.chatgptGetText(frameId, "cell");
    }
    if (!input) {
      input = actions.chatgptGetText(frameId, "all");
    }
    if (!input && !allowEmpty) {
      throw Error("Please write or select something.");
    }
  }
  // Truncate input (also this MUST lazy import):
  const { truncateMessage, numTokens, MAX_CHATGPT_TOKENS } = await import(
    "@cocalc/frontend/misc/openai"
  );
  const n = numTokens(input);
  const maxTokens = MAX_CHATGPT_TOKENS - 1000; // 1000 tokens reserved for output and the prompt below.
  if (n >= maxTokens) {
    input = truncateMessage(input, maxTokens) + "\n...";
  }

  const chatActions = await getChatActions(
    actions.redux,
    actions.project_id,
    actions.path
  );
  const delim = backtickSequence(input);
  let message = `<span class="user-mention" account-id=chatgpt>@ChatGPT</span> ${capitalize(
    command
  )} `;
  if (frameType != "terminal") {
    message += ` the following ${codegen ? "code" : ""} from the file ${
      actions.path
    } ${actions.chatgptExtraFileInfo()}:`;
    if (input.trim()) {
      message += `
${delim}${actions.chatgptGetLanguage()}
${input.trim()}
${delim}
${codegen && input.trim() ? "Show the new version." : ""}`;
    }
  } else {
    message +=
      ". I am currently using the Ubuntu Linux terminal in CoCalc.";
  }
  // scroll to bottom *after* the message gets sent.
  setTimeout(() => chatActions.scrollToBottom(), 100);
  await chatActions.send_chat(
    message,
    undefined,
    undefined,
    `code-editor-${tag ?? command}`
  );
}
