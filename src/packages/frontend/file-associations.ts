/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Mapping from file extension to what editor edits it.

This is mainly used to support editor.coffee, which is legacy.

The **complete** list of extensions --> what edits them is done
via the newer registration system.

NOTE: Obviously, github etc. has to solve basically the same problem,
and they have a similar massive list: https://github.com/blakeembrey/language-map/blob/main/languages.json
Maybe that could be useful at some point.
*/

import type { IconName } from "@cocalc/frontend/components/icon";

import imageExtensions from "image-extensions";
import videoExtensions from "video-extensions";
import audioExtensions from "audio-extensions";
import { filename_extension } from "@cocalc/util/misc";

export function filenameMode(path: string, fallback = "text"): string {
  return file_associations[filename_extension(path)]?.opts?.mode ?? fallback;
}

export function filenameIcon(
  path: string,
  fallback = "file" as IconName,
): IconName {
  return file_associations[filename_extension(path)]?.icon ?? fallback;
}

const codemirror_associations: { [ext: string]: string } = {
  adb: "ada",
  asm: "text/x-gas",
  bash: "shell",
  c: "text/x-c",
  cu: "text/x-c",
  zig: "text/x-c", // wrong, but much better than nothing
  "c++": "text/x-c++src",
  cob: "text/x-cobol",
  cql: "text/x-sql",
  cpp: "text/x-c++src",
  cc: "text/x-c++src",
  tcc: "text/x-c++src",
  cjs: "javascript",
  conf: "nginx", // should really have a list of different types that end in .conf and autodetect based on heuristics, letting user change.
  csharp: "text/x-csharp",
  "c#": "text/x-csharp",
  clj: "text/x-clojure",
  cljs: "text/x-clojure",
  cljc: "text/x-clojure",
  edn: "text/x-clojure",
  elm: "text/x-elm",
  erl: "text/x-erlang",
  hrl: "text/x-erlang", // according to https://en.wikipedia.org/wiki/Erlang_(programming_language)
  cjsx: "text/cjsx",
  coffee: "coffeescript",
  css: "css",
  diff: "text/x-diff",
  dtd: "application/xml-dtd",
  e: "text/x-eiffel",
  ecl: "ecl",
  f: "text/x-fortran", // https://github.com/mgaitan/CodeMirror/tree/be73b866e7381da6336b258f4aa75fb455623338/mode/fortran
  f90: "text/x-fortran",
  f95: "text/x-fortran",
  h: "text/x-c++hdr",
  hpp: "text/x-c++hdr",
  hs: "text/x-haskell",
  ini: "text/x-ini",
  lhs: "text/x-haskell",
  html: "htmlmixed",
  init: "shell",
  java: "text/x-java",
  jl: "text/x-julia",
  javascript: "javascript",
  js: "javascript",
  jsx: "jsx",
  json: "javascript",
  jsonl: "javascript", // See https://jsonlines.org/
  ls: "text/x-livescript",
  lua: "lua",
  m: "text/x-octave",
  md: "yaml-frontmatter", // See https://codemirror.net/mode/yaml-frontmatter/index.html; this is really "a YAML frontmatter at the start of a file, switching to " github flavored markdown after that.
  mjs: "javascript",
  ml: "text/x-ocaml",
  mysql: "text/x-sql",
  psql: "text/x-sql",
  patch: "text/x-diff",
  gp: "text/pari",
  go: "text/x-go",
  pari: "text/pari",
  pegjs: "pegjs",
  php: "php",
  pl: "text/x-perl",
  py: "python",
  python3: "python",
  pyx: "python",
  r: "r",
  R: "r",
  rmd: "rmd",
  qmd: "rmd",
  rnw: "rnw",
  rtex: "rtex",
  rs: "text/x-rustsrc",
  rst: "rst",
  rb: "text/x-ruby",
  ru: "text/x-ruby",
  sage: "python",
  scala: "text/x-scala",
  scm: "text/x-scheme",
  sh: "shell",
  spyx: "python",
  sql: "text/x-sql",
  ss: "text/x-scheme",
  sty: "stex2",
  txt: "text",
  tex: "stex2",
  ts: "application/typescript",
  tsx: "text/typescript-jsx",
  typescript: "application/typescript",
  toml: "text/x-toml",
  bib: "stex",
  bbl: "stex",
  xml: "xml",
  cml: "xml", // http://www.xml-cml.org/, e.g. used by avogadro
  kml: "xml", // https://de.wikipedia.org/wiki/Keyhole_Markup_Language
  xsl: "xml",
  ptx: "xml", // https://pretextbook.org/
  v: "verilog",
  vh: "verilog",
} as const;

export interface FileSpec {
  editor?: string;
  binary?: boolean;
  icon: IconName;
  opts: {
    mode?: string;
    indent_unit?: number;
    tab_size?: number;
    spaces_instead_of_tabs?: boolean;
    spellcheck?: boolean; // Use browser spellcheck by default
    architecture?: string; // used by assembly mode.
  };
  name: string;
  exclude_from_menu?: boolean;

  // opening this file type on a compute server is not supported yet
  exclude_from_compute_server?: boolean;

  // in cases when it could be ambiguous, use this extension, e.g.,
  // latex vs tex
  ext?: string;
}

export const file_associations: { [ext: string]: FileSpec } = {};

const MODE_TO_ICON: { [mode: string]: IconName } = {
  python: "python",
  coffeescript: "coffee",
  javascript: "js-square",
  jsx: "node-js",
  "application/typescript": "js-square", // it would be nice to have proper TS icons...
  "text/typescript-jsx": "node-js", // would be nice to have proper TS...
  "text/x-rustsrc": "cog",
  r: "r",
  rmd: "r",
  "text/x-gas": "microchip",
};

for (const ext in codemirror_associations) {
  const mode: string = codemirror_associations[ext];
  let name: string = mode;
  const i: number = name.indexOf("x-");
  if (i !== -1) {
    name = name.slice(i + 2);
  }
  name = name.replace("src", "");
  const icon = MODE_TO_ICON[mode] ?? "file-code";

  file_associations[ext] = {
    editor: "codemirror",
    icon,
    opts: { mode },
    name,
  };
}

file_associations["mojo"] = file_associations["🔥"] = {
  editor: "codemirror",
  icon: "fire",
  // Use "mojo" not "text/x-mojo" because the official Mojo jupyter
  // kernel has "codemirror_mode": {"name": "mojo" }
  opts: { mode: "mojo" }, // this is a custom type, similar to cython
  name: "mojo",
  exclude_from_menu: true,
  ext: "🔥",
};

// noext = means file with no extension but the given name.
file_associations["noext-dockerfile"] = {
  editor: "codemirror",
  icon: "docker",
  opts: { mode: "dockerfile", indent_unit: 2, tab_size: 2 },
  name: "Dockerfile",
  exclude_from_menu: true,
  ext: "",
};

file_associations["tex"] = {
  editor: "latex",
  icon: "tex-file",
  opts: { mode: "stex2", indent_unit: 2, tab_size: 2, spellcheck: true },
  name: "LaTeX",
  exclude_from_compute_server: false,
  ext: "tex",
};

file_associations["latex"] = file_associations["tex"];

// actual editor is defined in frame-editors.
// I'm just putting this here so it appears in the +New menu.
file_associations["csv"] = {
  name: "CSV File",
  icon: "csv",
  opts: {},
};

file_associations["json"] = {
  editor: "codemirror",
  icon: "js-square",
  opts: { mode: "javascript", indent_unit: 2, tab_size: 2 },
  name: "JSON",
};

// At https://cs.lmu.edu/~ray/notes/gasexamples/ they use .s, so I'm also including that.
// In fact, GCC only works on files if they end in .s.
file_associations["asm"] = file_associations["s"] = {
  editor: "codemirror",
  icon: "microchip",
  opts: { mode: "gas", architecture: "x86" },
  name: "GNU Assembler",
};

file_associations["lisp"] =
  file_associations["lsp"] =
  file_associations["el"] =
  file_associations["cl"] =
    {
      editor: "codemirror",
      icon: "file-code",
      opts: { mode: "commonlisp" },
      name: "Common Lisp",
    };

file_associations["rnw"] = {
  editor: "latex",
  icon: "tex-file",
  opts: {
    mode: codemirror_associations["rnw"],
    indent_unit: 4,
    tab_size: 4,
  },
  name: "R Knitr Rnw",
};

file_associations["rtex"] = {
  editor: "latex",
  icon: "tex-file",
  opts: {
    mode: codemirror_associations["rtex"],
    indent_unit: 4,
    tab_size: 4,
  },
  name: "R Knitr Rtex",
};

file_associations["html"] = {
  icon: "file-code",
  opts: { indent_unit: 4, tab_size: 4, mode: "htmlmixed" },
  name: "html",
} as const;

file_associations["md"] = file_associations["markdown"] = {
  icon: "markdown",
  opts: {
    indent_unit: 2,
    tab_size: 2,
    mode: codemirror_associations["md"],
    spellcheck: true,
  },
  name: "Markdown",
  ext: "md",
};

file_associations["rmd"] = {
  icon: "r",
  opts: {
    indent_unit: 4,
    tab_size: 4,
    mode: codemirror_associations["rmd"],
    spellcheck: true,
  },
  name: "RMarkdown",
  exclude_from_compute_server: true,
};

file_associations["qmd"] = {
  icon: "plus-circle-filled",
  opts: {
    indent_unit: 4,
    tab_size: 4,
    mode: codemirror_associations["rmd"],
    spellcheck: true,
  },
  name: "Quarto",
  exclude_from_compute_server: true,
};

file_associations["rst"] = {
  icon: "file-code",
  opts: { indent_unit: 4, tab_size: 4, mode: "rst", spellcheck: true },
  name: "ReST",
  exclude_from_compute_server: true,
};

file_associations["java"] = {
  editor: "codemirror",
  icon: "file-code",
  opts: { indent_unit: 4, tab_size: 4, mode: "text/x-java" },
  name: "Java",
};

file_associations["mediawiki"] = file_associations["wiki"] = {
  editor: "html-md",
  icon: "file-code",
  opts: { indent_unit: 4, tab_size: 4, mode: "mediawiki", spellcheck: true },
  name: "MediaWiki",
  ext: "wiki",
};

file_associations["sass"] = {
  editor: "codemirror",
  icon: "file-code",
  opts: { mode: "text/x-sass", indent_unit: 2, tab_size: 2 },
  name: "SASS",
};

file_associations["yml"] = file_associations["yaml"] = {
  editor: "codemirror",
  icon: "code",
  opts: { mode: "yaml", indent_unit: 2, tab_size: 2 },
  name: "YAML",
};

file_associations["pug"] = file_associations["jade"] = {
  editor: "codemirror",
  icon: "code",
  opts: { mode: "text/x-pug", indent_unit: 2, tab_size: 2, spellcheck: true },
  name: "PUG",
};

file_associations["css"] = {
  editor: "codemirror",
  icon: "file-code",
  opts: { mode: "css", indent_unit: 4, tab_size: 4 },
  name: "CSS",
};

for (const m of ["noext-makefile", "noext-gnumakefile", "make", "build"]) {
  file_associations[m] = {
    editor: "codemirror",
    icon: "cogs",
    opts: {
      mode: "makefile",
      indent_unit: 4,
      tab_size: 4,
      spaces_instead_of_tabs: false,
    },
    name: "Makefile",
    ext: "",
  };
}

file_associations["term"] = {
  editor: "terminal",
  icon: "terminal",
  opts: {},
  name: "Terminal",
};

// This is just for the "Create" menu in files.
file_associations["x11"] = {
  editor: "x11",
  icon: "window-restore",
  opts: {},
  name: "Linux Graphical X11 Desktop",
  exclude_from_compute_server: true,
};

file_associations["ipynb"] = {
  editor: "ipynb",
  icon: "ipynb",
  opts: {},
  name: "Jupyter Notebook",
};

// verilog files
file_associations["v"] = file_associations["vh"] = {
  editor: "codemirror",
  icon: "microchip",
  opts: { mode: "verilog", indent_unit: 2, tab_size: 2 },
  name: "Verilog",
};

for (const ext of ["png", "jpg", "jpeg", "gif", "svg", "bmp"]) {
  file_associations[ext] = {
    editor: "media",
    icon: "file-image",
    opts: {},
    name: ext,
    binary: true,
    exclude_from_menu: true,
  };
}

export const IMAGE_EXTS = Object.freeze(
  imageExtensions,
) as ReadonlyArray<string>;
export const VIDEO_EXTS = Object.freeze(
  videoExtensions,
) as ReadonlyArray<string>;
export const AUDIO_EXTS = Object.freeze(
  audioExtensions,
) as ReadonlyArray<string>;

file_associations["pdf"] = {
  editor: "pdf",
  icon: "file-pdf",
  opts: {},
  name: "pdf",
  binary: true,
  exclude_from_menu: true,
};

file_associations["tasks"] = {
  editor: "tasks",
  icon: "tasks",
  opts: {},
  name: "to do list",
};

file_associations["course"] = {
  editor: "course",
  icon: "graduation-cap",
  opts: {},
  name: "course",
  exclude_from_compute_server: true,
};

file_associations["board"] = {
  editor: "board",
  icon: "layout",
  opts: {},
  name: "whiteboard",
  exclude_from_compute_server: true,
};

file_associations["slides"] = {
  editor: "slides",
  icon: "slides",
  opts: {},
  name: "Slides",
  exclude_from_compute_server: true,
};

const chatAssociation: FileSpec = {
  editor: "chat",
  icon: "comment",
  opts: {},
  name: "chat",
};

file_associations["chat"] = chatAssociation;
file_associations["sage-chat"] = chatAssociation;

file_associations["cocalc-crm"] = {
  editor: "crm",
  icon: "database",
  opts: {},
  name: "crm",
};

file_associations["sage-git"] = {
  editor: "git",
  icon: "git-square",
  opts: {},
  name: "git",
};

file_associations["sage-template"] = {
  editor: "template",
  icon: "clone",
  opts: {},
  name: "template",
};

file_associations["sage-history"] = {
  editor: "history",
  icon: "history",
  opts: {},
  name: "sage history",
  exclude_from_menu: true,
};

// For tar, see http://en.wikipedia.org/wiki/Tar_%28computing%29
const archive_association = {
  editor: "archive",
  icon: "file-archive",
  opts: {},
  name: "archive",
} as FileSpec;

// Fallback for any type not otherwise explicitly specified
file_associations[""] = {
  editor: "unknown",
  icon: "question-circle",
  opts: { indent_unit: 4, tab_size: 4 },
  name: "",
};

const archive_extensions = [
  "bz2",
  "gz",
  "lz",
  "lzip",
  "lzma",
  "taz",
  "tb2",
  "tbz",
  "tbz2",
  "tgz",
  "tlz",
  "txz",
  "tz",
  "xz",
  "z",
  "zip",
] as const;

for (const ext of archive_extensions) {
  file_associations[ext] = archive_association;
}

file_associations["sagemath"] = file_associations["sage"];
file_associations["sage"].name = "sage code";
file_associations["sage"].icon = "sagemath-bold";
file_associations["sage"].ext = "sage";

file_associations["sagews"] = {
  editor: "sagews",
  binary: false,
  icon: "sagemath-file",
  opts: { mode: "sagews" },
  name: "sagews",
  exclude_from_menu: true,
  exclude_from_compute_server: true,
};

// some things in ~/.ssh
for (const m of ["authorized_keys", "config", "id_ed25519.pub"]) {
  file_associations["noext-" + m] = {
    editor: "codemirror",
    icon: "cogs",
    opts: {
      mode: "text",
      indent_unit: 4,
      tab_size: 4,
    },
    name: "Text",
    ext: "",
  };
}

export function excludeFromComputeServer(path: string): boolean {
  const ext = filename_extension(path);
  const x = file_associations[ext];
  return !!x?.exclude_from_compute_server;
}
