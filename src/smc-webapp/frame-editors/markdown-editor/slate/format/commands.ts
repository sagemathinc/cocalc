/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { is_array, startswith } from "smc-util/misc";
import { Editor, Element, Node, Text, Range, Transforms } from "slate";
import { ReactEditor } from "../slate-react";
import { markdown_to_slate } from "../markdown-to-slate";
import { commands } from "../../../../editors/editor-button-bar";
import { DEFAULT_CHILDREN } from "../util";
import { delay } from "awaiting";
import { insertLink } from "./insert-link";
import { insertImage } from "./insert-image";
import { insertSpecialChar } from "./insert-special-char";
import { emptyParagraph } from "../padding";

// Replaces {text:"foo bl[cursor]ah stuff xxx"} by
// {text:"foo "} {text:"bl[cursor]ah"} {text:"stuff xxx"}
// which is not normalized.  This is a step in doing
// something else.  Returns length of word.
function splitCurrentWord(editor: Editor): number {
  if (editor.selection == null) {
    return 0; // nothing to do -- no current word.
  }
  const { focus } = editor.selection;
  const [node, path] = Editor.node(editor, focus);
  if (!Text.isText(node)) {
    // not implemented except for in text nodes...
    return 0;
  }
  const { offset } = focus;
  if (!node.text[offset - 1]?.trim() || !node.text[offset]?.trim()) {
    // cursor is on the edge of a word (in this node)
    // TODO: much more work to do due to adjacent text nodes, e.g.,
    //     foo[cursor]**blah**
    return 0;
  }

  let start = offset;
  while (start > 0 && node.text[start - 1].trim() != "") {
    start -= 1;
  }
  let end = offset;
  while (end < node.text.length - 1 && node.text[end + 1].trim() != "") {
    end += 1;
  }
  if (start == end) return 0;
  Transforms.transform(editor, {
    type: "split_node",
    path,
    position: end + 1,
    properties: {},
  });
  Transforms.transform(editor, {
    type: "split_node",
    path,
    position: start,
    properties: {},
  });
  return end - start;
}

export function formatSelectedText(editor: Editor, mark: string): void {
  if (!editor.selection) return; // nothing to do.
  if (Range.isCollapsed(editor.selection)) {
    if (!splitCurrentWord(editor)) {
      // empty word or edge of word -- do not change.
      return;
    }
  }

  // This formats exactly the current selection or node, even if it
  // spans many nodes, etc.
  Transforms.setNodes(
    editor,
    { [mark]: !isAlreadyMarked(editor, mark) ? true : undefined },
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

export async function restoreSelection(editor: ReactEditor): Promise<void> {
  let selection = editor.selection;
  if (selection == null) {
    selection = (editor as any).lastSelection;
    if (selection == null) return;
    ReactEditor.focus(editor);
    // This delay is critical since otherwise the focus itself
    // also sets the selection cancelling out the setSelection below.
    await delay(0);
    Transforms.setSelection(editor, selection);
  }
}

export async function formatAction(
  editor: ReactEditor,
  cmd: string,
  args
): Promise<void> {
  // console.log("formatAction", cmd, args);
  await restoreSelection(editor);
  try {
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
      // args = #aa00bc (the hex color)
      unformatSelectedText(editor, { prefix: "color:" });
      formatSelectedText(editor, `color:${args.toLowerCase()}`);
      return;
    }

    if (cmd == "font_family") {
      unformatSelectedText(editor, { prefix: "font-family:" });
      formatSelectedText(editor, `font-family:${args.toLowerCase()}`);
      return;
    }

    if (startswith(cmd, "font_size")) {
      unformatSelectedText(editor, { prefix: "font-size:" });
      formatSelectedText(editor, `font-size:${args.toLowerCase()}`);
      return;
    }

    if (cmd == "equation") {
      transformToEquation(editor, false);
      return;
    }

    if (cmd == "comment") {
      transformToComment(editor);
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

    if (cmd == "link") {
      insertLink(editor);
      return;
    }

    if (cmd == "image") {
      insertImage(editor);
      return;
    }

    if (cmd == "SpecialChar") {
      insertSpecialChar(editor);
      return;
    }

    if (cmd == "format_code") {
      insertMarkdown(editor, "\n```\n```\n");
      return;
    }

    if (startswith(cmd, "format_heading_")) {
      // single digit is fine, since headings only go up to level 6.
      const level = parseInt(cmd[cmd.length - 1]);
      formatHeading(editor, level);
      return;
    }
  } finally {
    ReactEditor.focus(editor);
  }

  console.log("WARNING -- slate.format_action not implemented", {
    cmd,
    args,
    editor,
  });
}

function insertSnippet(editor: ReactEditor, name: string): boolean {
  let markdown = commands.md[name]?.wrap?.left;
  if (name == "insertunorderedlist") {
    // better for a wysiwyg editor...
    markdown = "- ";
  } else if (name == "insertorderedlist") {
    markdown = "1. ";
  }
  if (markdown == null) return false;
  insertMarkdown(editor, markdown.trim());
  return true;
}

function insertMarkdown(editor: ReactEditor, markdown: string) {
  const doc = markdown_to_slate(markdown, true);
  Transforms.insertNodes(editor, [...doc, emptyParagraph()]);
}

function transformToEquation(editor: Editor, display: boolean): void {
  let value = selectionToText(editor).trim();
  if (!value) {
    value = "x^2"; // placeholder math
  } else {
    // eliminate blank lines which break math apart
    value = value.replace(/^\s*\n/gm, "");
  }
  let node: Node;
  if (display) {
    node = {
      type: "display_math",
      value,
      isVoid: true,
      children: [{ text: "" }],
    };
  } else {
    node = {
      type: "inline_math",
      value,
      isVoid: true,
      isInline: true,
      children: [{ text: "" }],
    };
  }
  Transforms.insertFragment(editor, [node]);
}

function transformToComment(editor: Editor): void {
  const html = "<!--" + selectionToText(editor).trim() + "-->\n\n";
  const fragment: Node[] = [
    {
      type: "html_block",
      html,
      isVoid: true,
      isInline: false,
      children: [{ text: "" }],
    },
  ];
  Transforms.insertFragment(editor, fragment);
}

// TODO: This is very buggy
export function selectionToText(editor: Editor): string {
  if (!editor.selection) return "";
  // This is just directly using DOM API, not slatejs, so
  // could run into a subtle problem e.g., due to windowing.
  // However, that's very unlikely given our application.
  return getSelection()?.toString() ?? "";

  // The following is complicated but doesn't work in general.
  /*
  let fragment = Editor.fragment(editor, editor.selection);
  while (Element.isElement(fragment[0])) {
    fragment = fragment[0].children;
  }
  return fragmentToMarkdown(fragment);
  */
}

/*
function selectionToMarkdown(editor: Editor): string {
  if (!editor.selection) return "";
  return fragmentToMarkdown(Editor.fragment(editor, editor.selection));
}
*/
/*
function fragmentToMarkdown(fragment): string {
  return slate_to_markdown(fragment, { no_escape: true });
}
*/

function formatHeading(editor, level: number): void {
  Transforms.unwrapNodes(editor, {
    match: (node) => node["type"] == "heading",
    mode: "all",
  });
  if (level == 0) return; // paragraph mode -- no heading.
  Transforms.wrapNodes(
    editor,
    { type: "heading", level, children: DEFAULT_CHILDREN } as Element,
    { match: (node) => Editor.isBlock(editor, node) }
  );
}
