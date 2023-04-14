// find the longest sequence of backticks that can be used as a code fence in
// Markdown syntax.
export function backtickSequence(str: string): string {
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

  return longestSequence.length < 3 ? "```" : longestSequence + "`";
}
