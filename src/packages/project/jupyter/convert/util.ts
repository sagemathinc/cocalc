
export interface nbconvertParams {
  args: string[];
  directory?: string;
  timeout?: number;
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
