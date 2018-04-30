/*
Utility functions specific to the latex editor.
*/

export function pdf_path(path: string): string {
  return path.slice(0, path.length - 3) + "pdf";
}

