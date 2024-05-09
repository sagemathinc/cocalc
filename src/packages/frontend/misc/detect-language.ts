/*
Detect the language of some code.

This implements a quick ad hoc synchronous in browser heuristic *and*
an API call to the backend to run a sophisticated tensorflow
model (same code as vscode) that is "over 93% correct for 54
languages".
*/

// The language should define a key in the file-associations map.
// We automatically check that below on startup.
// I copied this from https://github.com/speed-highlight/core/blob/main/src/detect.js
// then modified it (basically changing everything). -- William Stein

// Original code is CC0 = public domain licensed.

// Also ChatGPT queries like "What are some common C++ keywords that are not used
// in the C programming language?" were helpful.

import { file_associations } from "../file-associations";
import api from "@cocalc/frontend/client/api";

const LANGUAGES = [
  [
    "sh",
    [/#!(\/usr)?\/bin\/bash|#!(\/usr)?\/bin\/sh/g, 500],
    [/\b(git\ )\b|\$/g, 30],
    [/\b(if\ |elif\ |then\ |fi|echo\ )\b|\$/g, 10],
  ],
  ["html", [/<\/?[a-z-]+[^\n>]*>/g, 10], [/^\s+<!DOCTYPE\s+html/g, 500]],
  [
    "js",
    [
      /\b(try|catch|console|await|async|function|export|import|this|class|for|let|const|map|join|require)\b/g,
      10,
    ],
  ],
  [
    "ts",
    [
      /\b(try|catch|console|await|async|function|export|import|this|class|for|let|const|map|join|require|implements|interface|namespace|string|number)\b/g,
      10,
    ],
  ],
  [
    "py",
    [
      /\b(def\ |print|class\ |and\ |or\ |lambda\ |import\ |"""|try|except|>>>\ )\b/g,
      15,
    ],
  ],
  [
    "sage",
    [
      /\b(def\ |print|class\ |and\ |or\ |lambda\ |"""|try|except|plot|solve|diff|matrix|sum|prod|subs|limit|factor|integrate|sage:\ )\b/g,
      15,
    ],
  ],
  ["sql", [/\b(SELECT|INSERT|FROM|WHERE|DROP)\b/g, 50]],
  ["pl", [/#!(\/usr)?\/bin\/perl/g, 500], [/\b(use|print)\b|\$/g, 10]],
  ["lua", [/#!(\/usr)?\/bin\/lua/g, 500]],
  [
    "make",
    [/\b(ifneq|endif|if|elif|then|fi|echo|.PHONY|^[a-z]+ ?:$)\b|\$/gm, 10],
  ],
  ["css", [/^(@import|@page|@media|(\.|#)[a-z]+)/gm, 20]],
  ["diff", [/^[+><-]/gm, 10], [/^@@ ?[-+,0-9 ]+ ?@@/gm, 25]],
  ["md", [/^(>|\t\*|\t\d+.)/gm, 10], [/\[.*\](.*)/g, 10]],
  ["noext-dockerfile", [/^(FROM|ENTRYPOINT|RUN)/gm, 500]],
  ["xml", [/<\/?[a-z-]+[^\n>]*>/g, 10], [/^<\?xml/g, 500]],
  ["c", [/#include\b|\bprintf\s+\(/g, 50]],
  [
    "cpp",
    [
      /#include\b|\bprintf\s+\(|::|namespace|class|new|delete|virtual|inline|explicit|bool|template|try|catch|throw|final/g,
      20,
    ],
  ],
  ["rs", [/^\s+(use|fn|mut|match)\b/gm, 100]],
  [
    "r",
    [/\b(c\(|sum|mean|sd|apply|NA)\b/g, 20],
    [/(c\(|sum|mean|sd|apply|NA|<\-)/g, 25],
  ],
  ["go", [/\b(func|fmt|package)\b/g, 100]],
  ["java", [/^import\s+java/gm, 500]],
  ["asm", [/^(section|global main|extern|\t(call|mov|ret))/gm, 100]],
  [
    "tex",
    [
      /\\(documentclass|usepackage|item|begin|end|section|subsection|subsubsection|label|ref|item)(\{|\[)/g,
      20,
    ],
  ],
] as const;

for (const [name] of LANGUAGES) {
  if (file_associations[name] == null) {
    console.warn(
      `WARNING: In misc/detect-languages, invalid mode name='${name}'`,
    );
  }
}

// Try to find the language the given code belong to
export default function detectLanguage(code: string): string {
  const v: [lang: string, score: number][] = [];
  for (const [lang, ...features] of LANGUAGES) {
    let s = 0;
    for (const [match, score] of features) {
      s += [...code.matchAll(match)].length * (score ?? 0);
    }
    if (s > 10) {
      v.push([lang, s]);
    }
  }
  v.sort((a, b) => b[1] - a[1]);
  return v[0]?.[0] ?? "txt";
}

// This calls a sophisticated tensorflow model, see
// https://github.com/microsoft/vscode-languagedetection
// and https://github.com/yoeo/guesslang
// It returns up to cutoff guesses, with the first one the most likely.
export async function guesslang(
  code: string,
  cutoff: number = 1,
): Promise<string[]> {
  return (await api("guesslang", { code, cutoff })).result;
}
