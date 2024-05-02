import getChatActions from "@cocalc/frontend/chat/get-actions";
import { backtickSequence } from "@cocalc/frontend/markdown/util";
import type { LanguageModel } from "@cocalc/util/db-schema/llm-utils";
import { capitalize } from "@cocalc/util/misc";
import { Actions, CodeEditorState } from "../code-editor/actions";
import { modelToMention } from "./llm-selector";

export interface Options {
  codegen?: boolean;
  command: string;
  allowEmpty?: boolean;
  tag?: string;
  model: LanguageModel;
}

export default async function createChat({
  actions,
  frameId,
  options,
  input,
}: {
  actions: Actions<CodeEditorState>;
  frameId: string;
  options: Options;
  input?: string;
}): Promise<void> {
  const { command, tag } = options;

  const message = await createChatMessage(actions, frameId, options, input);

  const chatActions = await getChatActions(
    actions.redux,
    actions.project_id,
    actions.path,
  );

  await chatActions.send_chat({
    input: message.message,
    tag: `code-editor-${tag ?? command}`,
    noNotification: true,
  });

  chatActions.scrollToBottom();
  // scroll to bottom again *after* the message starts getting responded to.
  setTimeout(() => chatActions.scrollToBottom(), 1000);
}

export async function createChatMessage(
  actions: Actions<CodeEditorState>,
  frameId: string,
  options: Options,
  input: string | undefined,
) {
  let { codegen } = options;
  const { command, model } = options;

  const frameType = actions._get_frame_type(frameId);
  if (frameType == "terminal") {
    input = "";
    codegen = false;
  }
  input = sanitizeInput(actions, frameId, options, input);

  // Truncate input (also this MUST lazy import):
  const { truncateMessage, getMaxTokens } = await import(
    "@cocalc/frontend/misc/llm"
  );
  const maxTokens = getMaxTokens(model) - 1000; // 1000 tokens reserved for output and the prompt below.
  input = truncateMessage(input, maxTokens);

  const delim = backtickSequence(input);
  const head = `${modelToMention(model)} ${capitalize(command)}:\n`;
  let message = "";
  if (frameType != "terminal") {
    message += `I am writing in the file ${
      actions.path
    } ${actions.languageModelExtraFileInfo(codegen)}.`;
    if (input.trim()) {
      message += ` The file includes the following ${
        codegen ? "code" : "content"
      }:`;
      message += `
${delim}${actions.languageModelGetLanguage()}
${input.trim()}
${delim}
${codegen && input.trim() ? "Show the new version." : ""}`;
    }
  } else {
    message += ". I am using the bash Ubuntu Linux terminal in CoCalc.";
  }
  if (message.includes("<details")) {
    message = `${head}\n\n${message}`;
  } else {
    message = `${head}\n\n<details><summary>Context</summary>\n\n${message}\n\n</details>`;
  }
  return { input, message };
}

function sanitizeInput(
  actions: Actions<CodeEditorState>,
  frameId: string,
  options: Options,
  input: string | undefined,
): string {
  let { allowEmpty } = options;
  const frameType = actions._get_frame_type(frameId);
  if (frameType == "terminal") {
    input = "";
    allowEmpty = true;
  } else {
    if (input == null) {
      input = actions.languageModelGetContext(frameId);
    }
    if (!input && !allowEmpty) {
      throw Error("Please write or select something.");
    }
  }
  if (input == null) {
    throw Error("bug");
  }
  return input;
}
