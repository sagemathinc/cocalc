/*
Spec for editing Jupyter notebooks via a frame tree.
*/

import { set } from "smc-util/misc2";
import { createEditor } from "../frame-tree/editor";

import { CellNotebook } from "./cell-notebook/cell-notebook";

/*
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
import { ClassicalNotebook } from "./classical-notebook";
*/

export const EDITOR_SPEC = {
  jupyter_cell_notebook: {
    short: "Notebook",
    name: "Notebook (default)",
    icon: "cc-icon-ipynb",
    component: CellNotebook,
    buttons: set([])
  }/*,
  jupyter_singledoc_notebook: {
    short: "SingleDoc",
    name: "Single Doc",
    icon: "code",
    component: SingleDocNotebook,
    buttons: set([])
  },
  jupyter_markdown: {
    short: "Markdown",
    name: "Markdown Doc",
    icon: "cc-icon-markdown",
    component: MarkdownNotebook,
    buttons: set([])
  },
  jupyter_log: {
    short: "Log",
    name: "Kernel Log",
    icon: "clipboard-list",
    component: Log,
    buttons: set([])
  },
  jupyter_raw: {
    short: "Raw",
    name: "Raw JSON editor",
    icon: "cc-icon-markdown",
    component: RawIPynb,
    buttons: set([])
  },
  jupyter_object_browser: {
    short: "Object",
    name: "Object Browser",
    icon: "sitemap",
    component: ObjectBrowser,
    buttons: set([])
  },
  jupyter_kernel: {
    short: "Kernel",
    name: "Kernel Config",
    icon: "server",
    component: KernelConfiguration,
    buttons: set([])
  },
  jupyter_assistant: {
    short: "Assistant",
    name: "Assistant Examples",
    icon: "magic",
    component: Assistant,
    buttons: set([])
  },
  jupyter_ipython_terminal: {
    short: "IPython",
    name: "IPython Terminal",
    icon: "terminal",
    component: IPythonTerminal,
    buttons: set([])
  },
  jupyter_plain_terminal: {
    short: "Terminal",
    name: "Plain Terminal",
    icon: "terminal",
    component: PlainTerminal,
    buttons: set([])
  },
  jupyter_file_editor: {
    short: "File",
    name: "File Editor",
    icon: "cc-icon-python",
    component: FileEditor,
    buttons: set([])
  },
  jupyter_documentation_viewer: {
    short: "Docs",
    name: "Documentation",
    icon: "question-circle",
    component: DocumentationViewer,
    buttons: set([])
  },
  jupyter_export: {
    short: "Export",
    name: "Export (nbconvert)",
    icon: "file-export",
    component: Export,
    buttons: set([])
  },
  jupyter_slideshow: {
    short: "Slideshow",
    name: "Slideshow View",
    icon: "slideshare",
    component: Slideshow,
    buttons: set([])
  },
  jupyter_classical: {
    short: "Classic",
    name: "Classic Notebook",
    icon: "cc-icon-ipynb",
    component: ClassicalNotebook,
    buttons: set([])
  }*/
};

export const Editor = createEditor({
  format_bar: false,
  editor_spec: EDITOR_SPEC,
  display_name: "JupyterNotebook"
});
