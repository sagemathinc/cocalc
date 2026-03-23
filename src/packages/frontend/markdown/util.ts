// Find the shortest backtick fence that safely wraps `str` in Markdown.
// If `language` is given, it is appended to the opening fence (e.g. "```py").
// The closing fence is always plain backticks.
export function backtickSequence(str: string, language?: string): string {
  let longestSequence = "";
  let currentSequence = "";
  let lastChar: string | null = null;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === "`" && lastChar === "`") {
      currentSequence += char;
    } else {
      if (currentSequence.length > longestSequence.length) {
        longestSequence = currentSequence;
      }
      currentSequence = char;
    }

    lastChar = char;
  }

  if (currentSequence.length > longestSequence.length) {
    longestSequence = currentSequence;
  }

  const fence =
    longestSequence.length < 3 ? "```" : longestSequence + "`";
  return language ? `${fence}${language}` : fence;
}
