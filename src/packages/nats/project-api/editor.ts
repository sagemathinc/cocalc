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
};

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

  // returns a patch to transform str into formatted form.
  formatterString: (opts: {
    str: string;
    options: FormatterOptions;
    path?: string; // only used for CLANG
  }) => Promise<string>;
}
