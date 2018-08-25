/*
Utility functions useful for frame-tree editors.
*/

import { path_split, separate_file_extension } from "../generic/misc";

export function parse_path(
  path: string
): { directory: string; base: string; filename: string } {
  let x = path_split(path);
  let y = separate_file_extension(x.tail);
  return { directory: x.head, base: y.name, filename: x.tail };
}

/* Declare that window has an extra app_base_url string param. */

declare global {
  interface Window {
    app_base_url: string;
  }
}

export function raw_url(project_id: string, path: string): string {
  return `${window.app_base_url}/${project_id}/raw/${path}`;
}

export function aux_file(path: string, ext: string): string {
  let s = path_split(path);
  s.tail += "." + ext;
  if (s.head) {
    return s.head + "/." + s.tail;
  } else {
    return "." + s.tail;
  }
}

export const PRETTIER_SUPPORT = {
  js: true,
  jsx: true,
  md: true,
  css: true,
  ts: true,
  tsx: true,
  json: true,
  py: true, // use external tool
  tex: true, // actually use latexformat
  r: true // formatR
};
