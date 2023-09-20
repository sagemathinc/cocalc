import { homedir } from "os";
import { resolve } from "path";

const HOME_DIRECTORY = homedir();

// written by ChatGPT4
export function getAbsolutePathFromHome(relativePath: string): string {
  if (relativePath[0] == "/") {
    // actually an absolute path.
    return relativePath;
  }
  const absolutePath = resolve(HOME_DIRECTORY, relativePath);
  return absolutePath;
}
