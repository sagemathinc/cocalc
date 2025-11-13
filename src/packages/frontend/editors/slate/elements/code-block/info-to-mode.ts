import { file_associations } from "@cocalc/frontend/file-associations";
import detectLanguage from "@cocalc/frontend/misc/detect-language";

// Convert the info string for a fenced code block to a codemirror mode
// when preferKernel is true return the actual kernel name or language.
export default function infoToMode(
  info: string | undefined | null,
  options: { value?: string; preferKernel?: boolean } = {},
): string {
  const { value, preferKernel } = options;
  info = info?.trim().toLowerCase();
  if (!info) {
    if (!value) return ""; // no info
    info = detectLanguage(value);
  }

  if (info == "mermaid") {
    return "md";
  }

  // Format that seems to work well with github (unlike python-markdown and rmarkdown!), and we
  // use internally, e.g.,
  //      py {kernel='sage-9.8'}   or      py {kernel="sage-9.8"}
  // so we have extra info in braces. Github just looks at the "python" part.
  if (preferKernel) {
    // extra the string that is after kernel as in the examples above, e.g., sage-9.8
    const kernelMatch = /kernel\s*=\s*[\'\"](.*?)[\'\"]/i.exec(info);
    if (kernelMatch) {
      return kernelMatch[1];
    }
  }

  // Rmarkdown format -- looks like {r stuff,engine=python,stuff}.
  //   https://github.com/yihui/knitr-examples/blob/master/023-engine-python.Rmd
  //   ```{r test-python, engine='python'}
  //   ```{python}
  // strip leading { and trailing }
  // Also "python-markdown" uses these braces, though differently.
  //   https://python-markdown.github.io/extensions/fenced_code_blocks
  //   ``` { .html .foo .bar }
  if (info[0] == "{") {
    info = info.slice(1, -1).trim();
    if (preferKernel) {
      const i = info.indexOf("kernel=");
      if (i != -1) {
        let mode = firstWord(info.slice(i + "kernel=".length));
        if (mode.startsWith("'") || mode.startsWith('"')) {
          mode = mode.slice(1, -1);
        }
        return mode;
      }
    }
  }
  info = info.toLowerCase().trim(); // our file_associations data all assumes lower case.

  // The mode specifier is then the first word before any blank
  let mode = firstWord(info);
  // mode can have a leading dot which we ignore, e.g., see
  //   https://python-markdown.github.io/extensions/fenced_code_blocks/
  if (mode[0] == ".") {
    mode = mode.slice(1);
  }

  if (mode == "r") {
    // If the mode is R then they optionally use an 'engine=' option to specify a
    // different mode entirely (in rmd), e.g., {r test-python, engine='python'}
    const i = info.indexOf("engine=");
    if (i != -1) {
      mode = firstWord(info.slice(i + "engine=".length));
      if (mode.startsWith("'") || mode.startsWith('"')) {
        mode = mode.slice(1, -1);
      }
    }
  }

  if (
    preferKernel &&
    (mode.startsWith("sage") ||
      mode.startsWith("octave") ||
      mode == "m" ||
      mode.startsWith("julia") ||
      mode == "jl" ||
      mode.startsWith("python"))
  ) {
    if (mode == "sage") {
      // it's nice for users to be able to type "sage" to get sage mode (since it's .sage file),
      // but the language for the sage kernels is always "sagemath".
      return "sagemath";
    }
    if (mode == "jl") {
      // similar remark about julia as for sage above
      return "julia";
    }
    if (mode == "m") {
      return "octave";
    }
    return mode;
  }

  let spec = file_associations[mode];

  if (preferKernel) {
    if (spec?.opts.mode == "shell") {
      // there is usually a bash kernel installed
      return "bash";
    }
  }

  if (spec == null) {
    // the keys of file_associations is (mostly) just the filename extension.
    // It's nice to also support matching the mime type of a codemirror mode partly, in case
    // the extension isn't found.
    for (const ext in file_associations) {
      const cmmode = file_associations[ext].opts?.mode;
      if (cmmode != null) {
        if (
          cmmode == mode ||
          (cmmode.startsWith("text/x-") && cmmode == "text/x-" + mode)
        ) {
          return cmmode;
        }
      }
    }
  }

  return spec?.opts.mode ?? info; // if nothing in file associations, maybe info is the mode, e.g. "python".
}

// Return the first word in the string s, where words are separated by whitespace or commas
// @param s the string to extract first word from
// @returns the first word in the string
function firstWord(s: string): string {
  // Use a regular expression to remove everything after the first comma, and then splits
  // the remaining string at any whitespace to return the first word.  - chatgpt
  return s.replace(/,.*/, "").split(/\s+/)[0];
}
