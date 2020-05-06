/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Mapping from file extension to what editor edits it.

This is mainly used to support editor.coffee, which is legacy.

The **complete** list of extensions --> what edits them is done
via the newer registration system.
*/

const codemirror_associations: { [ext: string]: string } = {
  adb: "ada",
  c: "text/x-c",
  "c++": "text/x-c++src",
  cob: "text/x-cobol",
  cql: "text/x-sql",
  cpp: "text/x-c++src",
  cc: "text/x-c++src",
  tcc: "text/x-c++src",
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
  lhs: "text/x-haskell",
  html: "htmlmixed",
  java: "text/x-java",
  jl: "text/x-julia",
  js: "javascript",
  jsx: "jsx",
  json: "javascript",
  lean: "lean", // obviously nowhere close...
  ls: "text/x-livescript",
  lua: "lua",
  m: "text/x-octave",
  md: "yaml-frontmatter",
  ml: "text/x-ocaml",
  mysql: "text/x-sql",
  patch: "text/x-diff",
  gp: "text/pari",
  go: "text/x-go",
  pari: "text/pari",
  pegjs: "pegjs",
  php: "php",
  pl: "text/x-perl",
  py: "python",
  pyx: "python",
  r: "r",
  rmd: "rmd",
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
  toml: "text/x-toml",
  bib: "stex",
  bbl: "stex",
  xml: "xml",
  cml: "xml", // http://www.xml-cml.org/, e.g. used by avogadro
  kml: "xml", // https://de.wikipedia.org/wiki/Keyhole_Markup_Language
  xsl: "xsl",
  v: "verilog",
  vh: "verilog",
  "": "text",
};

export interface FileSpec {
  editor?: string;
  binary?: boolean;
  icon: string;
  opts: {
    mode?: string;
    indent_unit?: number;
    tab_size?: number;
    spaces_instead_of_tabs?: boolean;
  };
  name: string;
  exclude_from_menu?: boolean;
}

export const file_associations: { [ext: string]: FileSpec } = {};

const MODE_TO_ICON: { [mode: string]: string } = {
  python: "cc-icon-python",
  coffeescript: "fa-coffee",
  javascript: "fab fa-js-square",
  jsx: "fab fa-node-js",
  "application/typescript": "fab fa-js-square", // it would be nice to have proper TS icons...
  "text/typescript-jsx": "fab fa-node-js", // would be nice to have proper TS...
  "text/x-rustsrc": "cog",
  r: "cc-icon-r",
  rmd: "cc-icon-r",
};

for (const ext in codemirror_associations) {
  const mode: string = codemirror_associations[ext];
  let name: string = mode;
  const i: number = name.indexOf("x-");
  if (i !== -1) {
    name = name.slice(i + 2);
  }
  name = name.replace("src", "");
  const icon = MODE_TO_ICON[mode] ? MODE_TO_ICON[mode] : "fa-file-code-o";

  file_associations[ext] = {
    editor: "codemirror",
    icon,
    opts: { mode },
    name,
  };
}

// noext = means file with no extension but the given name.
file_associations["noext-dockerfile"] = {
  editor: "codemirror",
  icon: "fa-ship",
  opts: { mode: "dockerfile", indent_unit: 2, tab_size: 2 },
  name: "Dockerfile",
};

file_associations["tex"] = {
  editor: "latex",
  icon: "cc-icon-tex-file",
  opts: { mode: "stex2", indent_unit: 2, tab_size: 2 },
  name: "LaTeX",
};

file_associations["rnw"] = {
  editor: "latex",
  icon: "cc-icon-tex-file",
  opts: {
    mode: codemirror_associations["rnw"],
    indent_unit: 4,
    tab_size: 4,
  },
  name: "R Knitr Rnw",
};

file_associations["rtex"] = {
  editor: "latex",
  icon: "cc-icon-tex-file",
  opts: {
    mode: codemirror_associations["rtex"],
    indent_unit: 4,
    tab_size: 4,
  },
  name: "R Knitr Rtex",
};

file_associations["html"] = {
  icon: "fa-file-code-o",
  opts: { indent_unit: 4, tab_size: 4, mode: "htmlmixed" },
  name: "html",
};

file_associations["md"] = file_associations["markdown"] = {
  icon: "cc-icon-markdown",
  opts: { indent_unit: 4, tab_size: 4, mode: codemirror_associations["md"] },
  name: "markdown",
};

file_associations["rmd"] = {
  icon: "cc-icon-r",
  opts: { indent_unit: 4, tab_size: 4, mode: codemirror_associations["rmd"] },
  name: "RMarkdown",
};

file_associations["rst"] = {
  icon: "fa-file-code-o",
  opts: { indent_unit: 4, tab_size: 4, mode: "rst" },
  name: "ReST",
};

file_associations["java"] = {
  editor: "codemirror",
  icon: "fa-file-code-o",
  opts: { indent_unit: 4, tab_size: 4, mode: "text/x-java" },
  name: "Java",
};

file_associations["mediawiki"] = file_associations["wiki"] = {
  editor: "html-md",
  icon: "fa-file-code-o",
  opts: { indent_unit: 4, tab_size: 4, mode: "mediawiki" },
  name: "MediaWiki",
};

file_associations["sass"] = {
  editor: "codemirror",
  icon: "fa-file-code-o",
  opts: { mode: "text/x-sass", indent_unit: 2, tab_size: 2 },
  name: "SASS",
};

file_associations["yml"] = file_associations["yaml"] = {
  editor: "codemirror",
  icon: "fa-code",
  opts: { mode: "yaml", indent_unit: 2, tab_size: 2 },
  name: "YAML",
};

file_associations["pug"] = file_associations["jade"] = {
  editor: "codemirror",
  icon: "fa-code",
  opts: { mode: "text/x-pug", indent_unit: 2, tab_size: 2 },
  name: "PUG",
};

file_associations["css"] = {
  editor: "codemirror",
  icon: "fa-file-code-o",
  opts: { mode: "css", indent_unit: 4, tab_size: 4 },
  name: "CSS",
};

for (const m of ["noext-makefile", "noext-gnumakefile", "make", "build"]) {
  file_associations[m] = {
    editor: "codemirror",
    icon: "fa-cogs",
    opts: {
      mode: "makefile",
      indent_unit: 4,
      tab_size: 4,
      spaces_instead_of_tabs: false,
    },
    name: "Makefile",
  };
}

file_associations["term"] = {
  editor: "terminal",
  icon: "fa-terminal",
  opts: {},
  name: "Terminal",
};

// This is just for the "Create" menu in files.
file_associations["x11"] = {
  editor: "x11",
  icon: "fa-window-restore",
  opts: {},
  name: "X11 Desktop",
};

file_associations["ipynb"] = {
  editor: "ipynb",
  icon: "cc-icon-ipynb",
  opts: {},
  name: "Jupyter Notebook",
};

// verilog files
file_associations["v"] = file_associations["vh"] = {
  editor: "codemirror",
  icon: "fa-microchip",
  opts: { mode: "verilog", indent_unit: 2, tab_size: 2 },
  name: "Verilog",
};

for (const ext of ["png", "jpg", "jpeg", "gif", "svg", "bmp"]) {
  file_associations[ext] = {
    editor: "media",
    icon: "fa-file-image-o",
    opts: {},
    name: ext,
    binary: true,
    exclude_from_menu: true,
  };
}

// See https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img
export const IMAGE_EXTS = Object.freeze([
  "jpg",
  "jpeg",
  "png",
  "bmp",
  "gif",
  "apng",
  "svg",
  "ico",
]) as ReadonlyArray<string>;

export const VIDEO_EXTS = Object.freeze([
  "webm",
  "mp4",
  "avi",
  "mkv",
  "ogv",
  "ogm",
  "3gp",
]) as ReadonlyArray<string>;

export const AUDIO_EXTS = Object.freeze([
  "wav",
  "ogg",
  "mp3",
  "aiff",
  "flac",
  "asnd",
  "aif",
  "au",
  "snd",
]) as ReadonlyArray<string>;

file_associations["pdf"] = {
  editor: "pdf",
  icon: "fa-file-pdf-o",
  opts: {},
  name: "pdf",
  binary: true,
  exclude_from_menu: true,
};

file_associations["tasks"] = {
  editor: "tasks",
  icon: "fa-tasks",
  opts: {},
  name: "to do list",
};

file_associations["course"] = {
  editor: "course",
  icon: "fa-graduation-cap",
  opts: {},
  name: "course",
};

file_associations["sage-chat"] = {
  editor: "chat",
  icon: "fa-comment",
  opts: {},
  name: "chat",
};

file_associations["sage-git"] = {
  editor: "git",
  icon: "fa-git-square",
  opts: {},
  name: "git",
};

file_associations["sage-template"] = {
  editor: "template",
  icon: "fa-clone",
  opts: {},
  name: "template",
};

file_associations["sage-history"] = {
  editor: "history",
  icon: "fa-history",
  opts: {},
  name: "sage history",
  exclude_from_menu: true,
};

// For tar, see http://en.wikipedia.org/wiki/Tar_%28computing%29
const archive_association = {
  editor: "archive",
  icon: "fa-file-archive-o",
  opts: {},
  name: "archive",
};

// Fallback for any type not otherwise explicitly specified
file_associations[""] = {
  editor: "codemirror",
  icon: "fa-file-code-o",
  opts: { mode: "text", indent_unit: 4, tab_size: 4 },
  name: "",
};

for (const ext of "zip gz bz2 z lz xz lzma tgz tbz tbz2 tb2 taz tz tlz txz lzip".split(
  " "
)) {
  file_associations[ext] = archive_association;
}

file_associations["sage"].name = "sage code";
file_associations["sage"].icon = "cc-icon-sagemath-bold";

file_associations["sagews"] = {
  editor: "sagews",
  binary: false,
  icon: "cc-icon-sagemath-file",
  opts: { mode: "sagews" },
  name: "sagews",
  exclude_from_menu: true,
};
