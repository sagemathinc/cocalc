import { IconName } from "@cocalc/frontend/components";

export const NEW_FILETYPE_ICONS: { [ext: string]: IconName } = {
  "/": "folder-open",
  ipynb: "jupyter",
  sagews: "sagemath-bold",
  sage: "sagemath-bold",
  tex: "tex-file",
  x11: "window-restore",
  md: "markdown",
  board: "layout",
  term: "terminal",
  slides: "slides",
  ["sage-chat"]: "comment",
  tasks: "tasks",
  server: "server",
  course: "graduation-cap",
  time: "stopwatch",
  rmd: "r",
  py: "python",
  jl: "julia",
  m: "octave",
  r: "r",
} as const;

export function isNewFiletypeIconName(ext?: string) {
  return ext != null && ext in NEW_FILETYPE_ICONS;
}

export const DELAY_SHOW_MS = 1500;
