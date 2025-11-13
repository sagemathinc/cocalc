import { to_iso_path } from "@cocalc/util/misc";

export function sanitizeFilename(text: string, ext: string): string {
  text = text.trim().split("\n").shift() ?? "";
  text = text.replace(/["']/g, "");
  // remove ending, we'll add it back later
  text = text.replace(new RegExp(`.${ext}`), "");

  // if there is a "filename:" in the text, remove everything until after it
  const i = text.indexOf("filename:");
  if (i >= 0) {
    text = text.slice(i + "filename:".length);
  }

  text = text
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9-_]/g, "")
    .trim()
    .slice(0, 64);

  return text;
}

export function getTimestamp(): string {
  return to_iso_path(new Date());
}

export function getFilename(
  text: string,
  prompt: string,
  ext: string,
): string | null {
  // use regex to search for '"filename: [filename]"'
  const match = text.match(/filename: \[(.*?)\]/);
  if (match == null) {
    if (text.split("\n").length < 5) {
      return null;
    } else {
      // we give up if there are more than 5 lines and no filename ...
      return sanitizeFilename(prompt.split("\n").join("_"), ext);
    }
  }
  return sanitizeFilename(match[1], ext);
}

export function commentBlock(text: string, ext: string) {
  const prefix = commentChars[ext] ?? "#";
  // prefix each line in text with `${prefix} `
  return text
    .split("\n")
    .map((line) => `${prefix} ${line}`)
    .join("\n");
}

const commentChars = {
  py: "#",
  r: "#",
  sql: "--",
  tex: "%",
  js: "//",
  c: "//",
  cpp: "//",
  java: "//",
  php: "//",
  sh: "#",
  pl: "#",
  go: "//",
  m: "%",
} as const

// Tag for tracking/activating this LLM feature
export const AI_GENERATE_DOC_TAG = "generate-document"
