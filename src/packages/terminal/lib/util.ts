export function getChannelName(path: string): string {
  return `terminal:${path}`;
}

export function getRemotePtyChannelName(path: string): string {
  return `terminal-pty:${path}`;
}

export function getCWD(pathHead, cwd?): string {
  // working dir can be set explicitly, and either be an empty string or $HOME
  if (cwd != null) {
    const HOME = process.env.HOME ?? "/home/user";
    if (cwd === "") {
      return HOME;
    } else if (cwd.startsWith("$HOME")) {
      return cwd.replace("$HOME", HOME);
    } else {
      return cwd;
    }
  }
  return pathHead;
}
