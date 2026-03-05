/*
 *  This file is part of CoCalc: Copyright © 2020 - 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { backtickSequence } from "@cocalc/frontend/markdown/util";
import { trunc, trunc_left, trunc_middle } from "@cocalc/util/misc";

import { CUTOFF } from "./consts";
import { showHelpMeFixDialog } from "./help-me-fix-dialog";
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
  cellContext?: string;
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
  prioritize,
  isHint = false,
}: GetHelpOptions) {
  await showHelpMeFixDialog({
    mode: isHint ? "hint" : "solution",
    project_id,
    path,
    error,
    line,
    input,
    task,
    tag,
    language,
    extraFileInfo,
    prioritize,
  });
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
  cellContext,
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

  if (cellContext) {
    message.push(cellContext);
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

  message.push(
    "Only show the relevant code snippet and maybe an explanation that fixes the issue. Do not repeat the entire file or document.",
  );

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
