/*
Try to shorten error messages in various languages while preserving some meaning.
Just returns the input unchanged if we don't have a heuristic.

For motivation, see https://github.com/sagemathinc/cocalc/issues/6634
*/

export default function shortenError(error: string, language?: string): string {
  if (!language) {
    return error;
  }
  language = language.toLowerCase();
  if (language.startsWith("py") || language.startsWith("sage")) {
    return shortenPythonStackTrace(error);
  }
  return error;
}

function shortenPythonStackTrace(error: string): string {
  const lines = error.split("\n");
  const resultLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i <= 15 || i >= lines.length - 15) {
      // always include the beginning 15 and ending 15 lines
      resultLines.push(line);
      continue;
    }
    const trim = line.trim();
    if (!trim || trim.startsWith("---")) continue;

    if (trim.match(/^\w*?\/\w*?\/.*?\.py in.*$/)) {
      resultLines.push(line);
    } else if (trim.match(/-+>\s\d+/)) {
      resultLines.push(line);
    }
  }

  return resultLines.join("\n");
}
