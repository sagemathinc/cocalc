import { homedir } from "os";
import { resolve } from "path";

export function getAbsolutePathFromHome(relativePath: string): string {
  if (relativePath[0] == "/") {
    // actually an absolute path.
    return relativePath;
  }
  // NOTE: call homedir each time, since client code may change the HOME env var
  // dynamically at runtime.
  return resolve(homedir(), relativePath);
}
