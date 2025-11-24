import getChatActions from "@cocalc/frontend/chat/get-actions";
import { backtickSequence } from "@cocalc/frontend/markdown/util";
import { trunc, trunc_left, trunc_middle } from "@cocalc/util/misc";
import { CUTOFF } from "./consts";
import { modelToMention } from "./llm-selector";
import shortenError from "./shorten-error";

export interface GetHelpOptions {
  project_id: string;
  path: string;
  tag?: string;
  error: string;
  input?: string;
  task?: string;
  line?: string;
  language?: string;
  extraFileInfo?: string;
  redux: any;
  prioritize?: "start" | "start-end" | "end";
  model: string;
  isHint?: boolean;
}

export interface CreateMessageOpts {
  tag?: string;
  error: string;
  line: string;
  input?: string;
  task?: string;
  language?: string;
  extraFileInfo?: string;
  prioritize?: "start" | "start-end" | "end";
  model: string;
  open: boolean;
  full: boolean;
  isHint?: boolean;
}

export async function getHelp({
  project_id,
  path,
  tag,
  line = "",
  error,
  input,
  task,
  language,
  extraFileInfo,
  redux,
  prioritize,
  model,
  isHint = false,
}: GetHelpOptions) {
  const messageText = createMessage({
    error,
    task,
    line,
    input,
    language,
    extraFileInfo,
    model,
    prioritize,
    open: true,
    full: true,
    isHint,
  });

  try {
    const actions = await getChatActions(redux, project_id, path);
    setTimeout(() => actions.scrollToBottom(), 100);
    const tagSuffix = isHint ? "hint" : "solution";
    await actions.sendChat({
      input: messageText,
      tag: `help-me-fix-${tagSuffix}${tag ? `:${tag}` : ""}`,
      noNotification: true,
    });
  } catch (err) {
    console.error("Error getting help:", err);
    throw err;
  }
}

export function createMessage({
  error,
  line,
  language,
  input,
  model,
  task,
  extraFileInfo,
  prioritize,
  open,
  full,
  isHint = false,
}: CreateMessageOpts): string {
  const message: string[] = [];
  const prefix = full ? modelToMention(model) + " " : "";
  if (isHint) {
    message.push(
      `${prefix}Please give me a hint to help me fix my code. Do not provide the complete solution - just point me in the right direction.`,
    );
  } else {
    message.push(`${prefix}Help me fix my code.`);
  }

  if (full)
    message.push(`<details${open ? " open" : ""}><summary>Context</summary>`);

  if (task) {
    message.push(`I ${task}.`);
  }

  error = trimStr(error, language);
  line = trimStr(line, language);

  message.push(`I received the following error:`);
  const delimE = backtickSequence(error);
  message.push(`${delimE}${language}\n${error}\n${delimE}`);

  if (line) {
    message.push(`For the following line:`);
    const delimL = backtickSequence(line);
    message.push(`${delimL}${language}\n${line}\n${delimL}`);
  }

  // We put the input last, since it could be huge and get truncated.
  // It's much more important to show the error, obviously.
  if (input) {
    if (input.length < CUTOFF) {
      message.push(`My ${extraFileInfo ?? ""} contains:`);
    } else {
      if (prioritize === "start-end") {
        input = trunc_middle(input, CUTOFF, "\n\n[...]\n\n");
      } else if (prioritize === "end") {
        input = trunc_left(input, CUTOFF);
      } else {
        input = trunc(input, CUTOFF);
      }
      const describe =
        prioritize === "start"
          ? "starts"
          : prioritize === "end"
            ? "ends"
            : "starts and ends";
      message.push(
        `My ${
          extraFileInfo ?? ""
        } code ${describe} as follows, but is too long to fully include here:`,
      );
    }
    const delimI = backtickSequence(input);
    message.push(`${delimI}${language}\n${input}\n${delimI}`);
  }

  if (full) message.push("</details>");

  return message.join("\n\n");
}

function trimStr(s: string, language): string {
  if (s.length > 3000) {
    // 3000 is about 500 tokens
    // This uses structure:
    s = shortenError(s, language);
    if (s.length > 3000) {
      // this just puts ... in the middle.
      s = trunc_middle(s, 3000);
    }
  }
  return s;
}
