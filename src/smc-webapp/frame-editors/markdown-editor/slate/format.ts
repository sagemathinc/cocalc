/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { is_array, startswith } from "smc-util/misc";
import { Editor, Node, Text, Transforms } from "slate";
import { slate_to_markdown } from "./slate-to-markdown";
import { markdown_to_slate } from "./markdown-to-slate";
import { commands } from "../../../editors/editor-button-bar";

export function formatSelectedText(editor: Editor, mark: string): void {
  if (!editor.selection) return; // nothing to do.
  Transforms.setNodes(
    editor,
    { [mark]: !isAlreadyMarked(editor, mark) },
    { match: (node) => Text.isText(node), split: true }
  );
}

function unformatSelectedText(
  editor: Editor,
  options: { prefix?: string }
): void {
  if (options.prefix) {
    // Remove all formatting of the selected text
    // that begins with the given prefix.
    while (true) {
      const mark = findMarkWithPrefix(editor, options.prefix);
      if (!mark) break;
      Transforms.setNodes(
        editor,
        { [mark]: false },
        { match: (node) => Text.isText(node), split: true }
      );
    }
  }
}

// returns true if current selection *starts* with mark.
function isAlreadyMarked(editor: Editor, mark: string): boolean {
  if (!editor.selection) return false;
  return isFragmentAlreadyMarked(
    Editor.fragment(editor, editor.selection),
    mark
  );
}

// returns true if fragment *starts* with mark.
function isFragmentAlreadyMarked(fragment, mark: string): boolean {
  if (is_array(fragment)) {
    fragment = fragment[0];
    if (fragment == null) return false;
  }
  if (Text.isText(fragment) && fragment[mark]) return true;
  if (fragment.children) {
    return isFragmentAlreadyMarked(fragment.children, mark);
  }
  return false;
}

// returns mark if current selection *starts* with a mark with the given prefix.
function findMarkWithPrefix(
  editor: Editor,
  prefix: string
): string | undefined {
  if (!editor.selection) return;
  return findMarkedFragmentWithPrefix(
    Editor.fragment(editor, editor.selection),
    prefix
  );
}

// returns mark if fragment *starts* with a mark that starts with prefix
function findMarkedFragmentWithPrefix(
  fragment,
  prefix: string
): string | undefined {
  if (is_array(fragment)) {
    fragment = fragment[0];
    if (fragment == null) return;
  }
  if (Text.isText(fragment)) {
    for (const mark in fragment) {
      if (startswith(mark, prefix) && fragment[mark]) {
        return mark;
      }
    }
  }
  if (fragment.children) {
    return findMarkedFragmentWithPrefix(fragment.children, prefix);
  }
  return;
}

export async function formatAction(
  editor: Editor,
  cmd: string,
  args
): Promise<void> {
  if (
    cmd == "bold" ||
    cmd == "italic" ||
    cmd == "underline" ||
    cmd == "strikethrough" ||
    cmd == "code" ||
    cmd == "sup" ||
    cmd == "sub"
  ) {
    formatSelectedText(editor, cmd);
    return;
  }

  if (cmd == "color") {
    // args = #aa00bc (the hex color) **is** the mark.
    unformatSelectedText(editor, { prefix: "#" });
    formatSelectedText(editor, args);
    return;
  }

  if (cmd == "font_family") {
    // TODO: need to remove all other fonts first...
    unformatSelectedText(editor, { prefix: "font-" });
    formatSelectedText(editor, "font-" + args.toLowerCase());
    return;
  }

  if (cmd == "equation") {
    transformToEquation(editor, false);
    return;
  }

  if (cmd == "display_equation") {
    transformToEquation(editor, true);
    return;
  }

  if (
    cmd == "insertunorderedlist" ||
    cmd == "insertorderedlist" ||
    cmd == "table" ||
    cmd == "horizontalRule" ||
    cmd == "quote"
  ) {
    insertSnippet(editor, cmd);
    return;
  }

  console.log("WARNING -- slate.format_action not implemented", {
    cmd,
    args,
    editor,
  });
}

function insertSnippet(editor: Editor, name: string): boolean {
  const markdown = commands.md[name]?.wrap?.left;
  if (markdown == null) return false;
  const nodes = markdown_to_slate(markdown.trim());
  Transforms.insertNodes(editor, nodes);
  return true;
}

function transformToEquation(editor: Editor, display: boolean): void {
  let content = selectionToText(editor).trim();
  if (!content) {
    content = "x^2"; // placeholder math
  } else {
    // eliminate blank lines which break math apart
    content = content.replace(/^\s*\n/gm, "");
  }
  const wrap = "$" + (display ? "$" : "");
  const fragment: Node[] = [
    {
      type: "math",
      value: wrap + content + wrap,
      isVoid: true,
      isInline: true,
      children: [{ text: "" }],
    },
  ];
  Transforms.insertFragment(editor, fragment);
}

function selectionToText(editor: Editor): string {
  if (!editor.selection) return "";
  let fragment = Editor.fragment(editor, editor.selection);
  while (fragment[0].children != null && !Text.isText(fragment[0])) {
    fragment = fragment[0].children;
  }
  return fragmentToMarkdown(fragment);
}

/*
function selectionToMarkdown(editor: Editor): string {
  if (!editor.selection) return "";
  return fragmentToMarkdown(Editor.fragment(editor, editor.selection));
}
*/

function fragmentToMarkdown(fragment): string {
  return slate_to_markdown(fragment, { no_escape: true });
}
