import type { NbconvertParams } from "@cocalc/util/jupyter/types";
import type { RunNotebookOptions } from "@cocalc/util/jupyter/nbgrader-types";
import type { Options as FormatterOptions } from "@cocalc/util/code-formatter";
import type { KernelSpec } from "@cocalc/util/jupyter/types";

export const editor = {
  newFile: true,
  jupyterStripNotebook: true,
  jupyterNbconvert: true,
  jupyterRunNotebook: true,
  jupyterKernelLogo: true,
  jupyterKernels: true,
  formatterString: true,
  printSageWS: true,
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
  // Create a new file with the given name, possibly aware of templates.
  // This was cc-new-file in the old smc_pyutils python library.  This
  // is in editor, since it's meant to be for creating a file aware of the
  // context of our editors.
  newFile: (path: string) => Promise<void>;

  jupyterStripNotebook: (path_ipynb: string) => Promise<string>;

  jupyterNbconvert: (opts: NbconvertParams) => Promise<void>;

  jupyterRunNotebook: (opts: RunNotebookOptions) => Promise<string>;

  jupyterKernelLogo: (
    kernelName: string,
    opts?: { noCache?: boolean },
  ) => Promise<{ filename: string; base64: string }>;

  jupyterKernels: (opts?: { noCache?: boolean }) => Promise<KernelSpec[]>;

  // returns formatted version of str.
  formatterString: (opts: {
    str: string;
    options: FormatterOptions;
    path?: string; // only used for CLANG
  }) => Promise<string>;

  printSageWS: (opts) => Promise<string>;

  createTerminalService: (
    termPath: string,
    opts: CreateTerminalOptions,
  ) => Promise<void>;
}
