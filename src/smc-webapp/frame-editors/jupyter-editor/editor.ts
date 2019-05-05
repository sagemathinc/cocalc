/*
Spec for editing Jupyter notebooks via a frame tree.
*/

import { set } from "smc-util/misc2";
import { createEditor } from "../frame-tree/editor";

import { CellNotebook } from "./cell-notebook";
import { Log } from "./log";
import { RawIPynb } from "./raw-ipynb";
import { ObjectBrowser } from "./object-browser";
import { KernelConfiguration } from "./kernel-configuration";
import { Assistant } from "./assistant";
import { SingleDocNotebook } from "./singledoc-notebook";
import { MarkdownNotebook } from "./markdown-notebook";
import { DocumentationViewer } from "./documentation-viewer";
import { FileEditor } from "./file-editor";
import { PlainTerminal } from "./plain-terminal";
import { IPythonTerminal } from "./ipython-terminal";
import { Export } from "./export";
import { Slideshow } from "./slideshow";

export const EDITOR_SPEC = {
  jupyter_cell_notebook: {
    short: "Cells",
    name: "Cells (default)",
    icon: "file-pdf-o",
    component: CellNotebook,
    buttons: set([])
  },
  jupyter_singledoc_notebook: {
    short: "SingleDoc",
    name: "Single Doc",
    icon: "file-pdf-o",
    component: SingleDocNotebook,
    buttons: set([])
  },
  jupyter_markdown: {
    short: "Markdown",
    name: "Markdown Doc",
    icon: "file-pdf-o",
    component: MarkdownNotebook,
    buttons: set([])
  },
  jupyter_log: {
    short: "Log",
    name: "Kernel Log",
    icon: "file-pdf-o",
    component: Log,
    buttons: set([])
  },
  jupyter_raw: {
    short: "Raw",
    name: "Raw JSON editor",
    icon: "file-pdf-o",
    component: RawIPynb,
    buttons: set([])
  },
  jupyter_object_browser: {
    short: "Object",
    name: "Object Browser",
    icon: "file-pdf-o",
    component: ObjectBrowser,
    buttons: set([])
  },
  jupyter_kernel: {
    short: "Kernel",
    name: "Kernel Config",
    icon: "file-pdf-o",
    component: KernelConfiguration,
    buttons: set([])
  },
  jupyter_assistant: {
    short: "Assistant",
    name: "Assistant Examples",
    icon: "file-pdf-o",
    component: Assistant,
    buttons: set([])
  },
  jupyter_ipython_terminal: {
    short: "IPython",
    name: "IPython Terminal",
    icon: "file-pdf-o",
    component: IPythonTerminal,
    buttons: set([])
  },
  jupyter_plain_terminal: {
    short: "Terminal",
    name: "Plain Terminal",
    icon: "file-pdf-o",
    component: PlainTerminal,
    buttons: set([])
  },
  jupyter_file_editor: {
    short: "File",
    name: "File Editor",
    icon: "file-pdf-o",
    component: FileEditor,
    buttons: set([])
  },
  jupyter_documentation_viewer: {
    short: "Docs",
    name: "Documentation",
    icon: "file-pdf-o",
    component: DocumentationViewer,
    buttons: set([])
  },
  jupyter_export: {
    short: "Export",
    name: "Export (nbconvert)",
    icon: "file-pdf-o",
    component: Export,
    buttons: set([])
  },
  jupyter_slideshow: {
    short: "Slideshow",
    name: "Slideshow View",
    icon: "file-pdf-o",
    component: Slideshow,
    buttons: set([])
  }
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "JupyterNotebook"
});
