//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: MS-RSL – see LICENSE.md for details
//########################################################################

// Multiplex'd worksheet mode

import { clone, object } from "underscore";
import CodeMirror from "./codemirror";
import "codemirror/addon/mode/multiplex";
import "./multiplex";

export const decorator_modes: [string, string][] = [
  ["cjsx", "text/cjsx"],
  ["coffeescript", "coffeescript"],
  ["cython", "cython"],
  ["file", "text"],
  ["fortran", "text/x-fortran"],
  ["html", "htmlmixed"],
  ["javascript", "javascript"],
  ["java", "text/x-java"], // !! more specific name must be first!!!! (java vs javascript!)
  ["latex", "stex"],
  ["lisp", "ecl"],
  ["md", "gfm2"],
  ["gp", "text/pari"],
  ["go", "text/x-go"],
  ["perl", "text/x-perl"],
  ["python3", "python"],
  ["python", "python"],
  ["ruby", "text/x-ruby"], // !! more specific name must be first or get mismatch!
  ["r", "r"],
  ["sage", "python"],
  ["script", "shell"],
  ["sh", "shell"],
  ["julia", "text/x-julia"],
  ["wiki", "mediawiki"],
  ["mediawiki", "mediawiki"],
];

// Many of the modes below are multiplexed

interface MultiplexOption {
  open: string | RegExp;
  close: string | RegExp;
  mode: unknown;
  start?: boolean;
  delimStyle?: string;
}

// not using these two gfm2 and htmlmixed2 modes, with their sub-latex mode, since
// detection of math isn't good enough.  e.g., \$ causes math mode and $ doesn't seem to...   \$500 and $\sin(x)$.

CodeMirror.defineMode("gfm2", function (config) {
  const options: MultiplexOption[] = [];
  for (let x of [
    ["$$", "$$"],
    ["$", "$"],
    ["\\[", "\\]"],
    ["\\(", "\\)"],
  ]) {
    options.push({
      open: x[0],
      close: x[1],
      mode: CodeMirror.getMode(config, "stex"),
    });
  }
  return (CodeMirror as any).multiplexingMode(
    CodeMirror.getMode(config, "gfm"),
    ...options
  );
});

CodeMirror.defineMode("htmlmixed2", function (config) {
  const options: MultiplexOption[] = [];
  for (let x of [
    ["$$", "$$"],
    ["$", "$"],
    ["\\[", "\\]"],
    ["\\(", "\\)"],
  ]) {
    options.push({
      open: x[0],
      close: x[1],
      mode: CodeMirror.getMode(config, "stex"),
    });
  }
  return (CodeMirror as any).multiplexingMode(
    CodeMirror.getMode(config, "htmlmixed"),
    ...options
  );
});

CodeMirror.defineMode("stex2", function (config) {
  const options: MultiplexOption[] = [];
  for (let x of ["sagesilent", "sageblock"]) {
    options.push({
      open: `\\begin{${x}}`,
      close: `\\end{${x}}`,
      mode: CodeMirror.getMode(config, "python"),
    });
  }
  options.push({
    open: "\\sage{",
    close: "}",
    mode: CodeMirror.getMode(config, "python"),
  });
  return (CodeMirror as any).multiplexingMode(
    CodeMirror.getMode(config, "stex"),
    ...options
  );
});

CodeMirror.defineMode("rnw", function (config) {
  const block = {
    open: /^<<.+?>>=/,
    close: /^@/,
    mode: CodeMirror.getMode(config, "r"),
  };
  const inline = {
    open: "\\Sexpr{",
    close: "}",
    mode: CodeMirror.getMode(config, "r"),
  };
  return (CodeMirror as any).multiplexingMode(
    CodeMirror.getMode(config, "stex2"),
    block,
    inline
  );
});

CodeMirror.defineMode("rtex", function (config) {
  const block = {
    open: /^%%\s+begin\.rcode/,
    close: /^%%\s+end\.rcode/,
    indent: "% ",
    mode: CodeMirror.getMode(config, "r"),
  };
  const inline = {
    open: "\\rinline{",
    close: "}",
    mode: CodeMirror.getMode(config, "r"),
  };
  return (CodeMirror as any).multiplexingMode(
    CodeMirror.getMode(config, "stex2"),
    block,
    inline
  );
});

CodeMirror.defineMode("cython", (config) => {
  // FUTURE: need to figure out how to do this so that the name
  // of the mode is cython
  return (CodeMirror as any).multiplexingMode(
    CodeMirror.getMode(config, "python")
  );
});

CodeMirror.defineMode("mojo", (config) => {
  // FUTURE: need to figure out how to do this so that the name
  // of the mode is mojo or modular
  return (CodeMirror as any).multiplexingMode(
    CodeMirror.getMode(config, "python")
  );
});

CodeMirror.defineMode("rmd", function (config) {
  // derived from the decorated modes with some additions
  let mode, open;
  const modes = clone(object(decorator_modes));
  modes["fortran95"] = modes["fortran"];
  modes["octave"] = "octave";
  modes["bash"] = modes["sh"];

  const options: MultiplexOption[] = [];

  // blocks (ATTN ruby before r!)
  // all engine modes: names(knitr::knit_engines$get())
  for (let name of [
    "ruby",
    "r",
    "python",
    "octave",
    "fortran95",
    "fortran",
    "octave",
    "bash",
    "go",
    "julia",
    "perl",
  ]) {
    mode = modes[name];
    open = new RegExp(`\`\`\`\\s*{${name}[^}]*?}`);
    options.push({
      open,
      close: "```",
      delimStyle: "gfm",
      mode: CodeMirror.getMode(config, mode),
    });
  }

  // ATTN: this case must come later, it is less specific
  // inline, just `r ...` exists, not for other languages.
  options.push({
    open: "`r",
    close: "`",
    mode: CodeMirror.getMode(config, "r"),
  });

  return (CodeMirror as any).multiplexingMode(
    CodeMirror.getMode(config, "yaml-frontmatter"),
    ...options
  );
});
