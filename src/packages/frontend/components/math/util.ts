export function replaceMathBracketDelims(data: string): string {
  return data
    .replace(/\\\[/g, "$$")
    .replace(/\\\]/g, "$$")
    .replace(/\\\(/g, "$")
    .replace(/\\\)/g, "$");
}

export function isMathFormula(data: string): boolean {
  if (!data.startsWith("\\")) return true;
  if (!data.startsWith("\\begin{")) {
    return false;
  } else {
    const i = data.indexOf("{");
    const j = data.indexOf("}");
    if (i == -1 || j == -1) return false;
    const env = data.slice(i + 1, j);
    if (!env.includes("math") && env != "equation") {
      return false;
    }
  }
  return true;
}
