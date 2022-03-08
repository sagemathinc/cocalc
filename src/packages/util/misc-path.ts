// lower case extension of the path
export function getExtension(path: string): string {
  const v = path.split(".");
  return (v.length <= 1 ? "" : v.pop() ?? "").toLowerCase();
}

export function containingPath(path: string): string {
  const i = path.lastIndexOf("/");
  if (i != -1) {
    return path.slice(0, i);
  } else {
    return "";
  }
}

export function splitFirst(
  path: string,
  symbol: string = "/"
): [string, string] {
  const i = path.indexOf(symbol);
  if (i == -1) {
    return [path, ""];
  }
  return [path.slice(0, i), path.slice(i + 1)];
}

export function splitLast(
  path: string,
  symbol: string = "/"
): [string, string] {
  const i = path.lastIndexOf(symbol);
  if (i == -1) {
    return [path, ""];
  }
  return [path.slice(0, i), path.slice(i + 1)];
}
