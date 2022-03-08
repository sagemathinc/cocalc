export interface NbconvertParams {
  args: string[];
  directory?: string;
  timeout?: number; // in seconds!
}

export function parseTo(args: string[]): { to: string; j: number } {
  let j: number = 0;
  let to: string = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--to") {
      j = i;
      to = args[i + 1];
      break;
    }
  }
  return { to, j };
}

export function parseSource(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      if (args[i] != "--" && !args[i].includes("=")) {
        // skip argument to --
        i += 1;
      }
      continue;
    }
    // doesn't start with -- or wasn't next arg skipped due to starting with --
    return args[i];
  }
  throw Error("no source");
}
