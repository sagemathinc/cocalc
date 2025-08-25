import type { Options as FormatterOptions } from "@cocalc/util/code-formatter";

export const editor = {
  formatString: true,

  printSageWS: true,
  sagewsStart: true,
  sagewsStop: true,

  createTerminalService: true,
};

export interface CreateTerminalOptions {
  env?: { [key: string]: string };
  command?: string;
  args?: string[];
  cwd?: string;
  ephemeral?: boolean;
  // path of the primary tab in the browser, e.g., if you open a.term it's a.term for all frames,
  // and if you have term next to a.md (say), then it is a.md.
  path: string;
}

export interface Editor {
  // returns formatted version of str.
  formatString: (opts: {
    str: string;
    options: FormatterOptions;
    path?: string; // only used for CLANG
  }) => Promise<string>;

  printSageWS: (opts) => Promise<string>;
  sagewsStart: (path_sagews: string) => Promise<void>;
  sagewsStop: (path_sagews: string) => Promise<void>;

  createTerminalService: (
    termPath: string,
    opts: CreateTerminalOptions,
  ) => Promise<void>;
}
