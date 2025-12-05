// this is just used for logging so that we can copy/paste commands
// for easier debugging.
export function argsJoin(args: string[]): string {
  return args
    .map((arg) => {
      const hasWs = /\s/.test(arg);
      const hasSingle = arg.includes("'");
      const hasDouble = arg.includes('"');

      // No quoting needed.
      if (!hasWs && !hasSingle && !hasDouble) return arg;

      // Prefer the opposite quote if only one type is present.
      if (hasSingle && !hasDouble) {
        // Wrap in double quotes, escape characters that double-quoted strings interpret.
        return `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
      }
      if (hasDouble && !hasSingle) {
        return `'${arg}'`;
      }

      // Contains both quote types or whitespace + other chars: double-quote and escape.
      return `"${arg.replace(/(["\\$`])/g, "\\$1")}"`;
    })
    .join(" ");
}
