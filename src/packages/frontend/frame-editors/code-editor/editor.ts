/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Top-level react component for editing code.
*/

import { CodemirrorEditor } from "./codemirror-editor";
import { filename_extension, set } from "@cocalc/util/misc";
import { createEditor } from "../frame-tree/editor";
import { EditorDescription } from "../frame-tree/types";
import { terminal } from "../terminal-editor/editor";
import { time_travel } from "../time-travel-editor/editor";
import { fileExtensionsSet } from "@cocalc/util/code-formatter";

export const SHELLS = {
  erl: "erl",
  hrl: "erl",
  py: "python3",
  sage: "sage",
  r: "R",
  m: "octave",
  jl: "julia",
  js: "node",
  ts: "ts-node",
  coffee: "coffee",
  gp: "gp",
  lua: "lua",
  ml: "ocaml",
  pl: "perl",
  rb: "ruby",
} as const;

// Maps file extensions to run commands.
// {file} = basename (e.g. "hello.c"), {name} = basename without extension (e.g. "hello").
export const RUN_COMMANDS: { [ext: string]: string } = {
  py: "python3 {file}",
  sage: "sage {file}",
  js: "node {file}",
  ts: "npx ts-node {file}",
  c: "gcc {file} -o ./{name} && ./{name}",
  cpp: "g++ {file} -o ./{name} && ./{name}",
  cc: "g++ {file} -o ./{name} && ./{name}",
  java: "javac {file} && java {name}",
  go: "go run {file}",
  rs: "rustc {file} -o ./{name} && ./{name}",
  rb: "ruby {file}",
  jl: "julia {file}",
  r: "Rscript {file}",
  R: "Rscript {file}",
  sh: "bash {file}",
  bash: "bash {file}",
  pl: "perl {file}",
  lua: "lua {file}",
  m: "octave {file}",
};

export const cm: EditorDescription = {
  type: "cm",
  short: "Code",
  name: "Source Code",
  icon: "code",
  component: CodemirrorEditor,
  commands: set([
    "print",
    "decrease_font_size",
    "increase_font_size",
    "save",
    "time_travel",
    "chatgpt",
    "replace",
    "find",
    "goto_line",
    "cut",
    "paste",
    "copy",
    "undo",
    "redo",
    "run_code",
    "terminal",
    "format",
    "auto_indent",
    "settings",
    //"tour"
  ]),
  customizeCommands: {
    format: {
      isVisible: ({ props }) => {
        return fileExtensionsSet.has(filename_extension(props.path) as any);
      },
    },
  },
} as const;

const EDITOR_SPEC = {
  cm,
  terminal,
  time_travel,
} as const;

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "CodeEditor",
});
