/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Anonymous User Welcome File
 *
 * The goal is to present an anonymous user with a file/editor matching a specific intention.
 * What exactly is open for experientation, but it is clear that if you want to run "latex",
 * you're not interested in working with a "juypter notebook".
 */

import { delay } from "awaiting";

import { once } from "@cocalc/util/async-utils";
import { redux } from "@cocalc/frontend/app-framework";
import { QueryParams } from "../misc/query-params";
import { separate_file_extension } from "@cocalc/util/misc";
import type { JupyterActions } from "@cocalc/frontend/jupyter/browser-actions";

type Kernel = "ir" | "python3" | "bash" | "octave";
type Cell = { type?: "markdown" | "code"; content: string };

const ir_welcome = `# Welcome to R in CoCalc!

Run a cell via \`Shift + Return\`. Learn more about [CoCalc Jupyter Notebooks](https://doc.cocalc.com/jupyter.html).`;

const python3_welcome = `# Welcome to Python in CoCalc!

Run a cell via \`Shift + Return\`. Learn more about [CoCalc Jupyter Notebooks](https://doc.cocalc.com/jupyter.html).`;

const bash_welcome = `# Welcome to Bash in CoCalc!

Run a cell via \`Shift + Return\`. Learn more about [CoCalc Jupyter Notebooks](https://doc.cocalc.com/jupyter.html).`;

const octave_welcome = `# Welcome to Octave in CoCalc!

Run a cell via \`Shift + Return\`. Learn more about [CoCalc Jupyter Notebooks](https://doc.cocalc.com/jupyter.html).`;

const WelcomeSetups: Record<Kernel, Cell[]> = {
  ir: [
    { type: "markdown", content: ir_welcome },
    { content: "data <- rnorm(100)\nsummary(data)" },
    { content: "hist(data)" },
  ],
  python3: [
    { type: "markdown", content: python3_welcome },
    { content: "import sys\nsys.version" },
    { content: "import matplotlib.pyplot as plt\nimport numpy as np" },
    {
      content: `xx = np.linspace(0, 10 * np.pi, 1000)
yy = np.sin(xx) * np.exp(-xx / 10)
plt.grid()
plt.plot(xx, yy)`,
    },
  ],
  bash: [
    { type: "markdown", content: bash_welcome },
    { content: 'foo="World"\necho "Hello $foo!"' },
    { content: "date" },
    { content: "echo '2*20 + 2' | bc -l" },
  ],
  octave: [
    { type: "markdown", content: octave_welcome },
    {
      content: `x = 1:10;
y = 1:10;
x' * y`,
    },
    {
      content: `tx = ty = linspace (-8, 8, 41)';
[xx, yy] = meshgrid (tx, ty);
r = sqrt (xx .^ 2 + yy .^ 2) + eps;
tz = sin (r) ./ r;
mesh (tx, ty, tz);
xlabel ("tx");
ylabel ("ty");
zlabel ("tz");
title ("3-D Sombrero plot");`,
    },
  ],
};

export class WelcomeFile {
  private readonly project_id: string;
  private readonly param: string;
  private readonly path: string | undefined;

  constructor(project_id: string) {
    this.project_id = project_id;
    const qparam = QueryParams.get("anonymous");
    if (qparam != null) {
      this.param = (Array.isArray(qparam) ? qparam[0] : qparam).toLowerCase();
    }
    if (this.param == null) return;
    this.path = this.make_path();
  }

  async open() {
    if (this.path == null) return;
    await this.createFile();
    await this.extra_setup();
  }

  private async extra_setup(): Promise<void> {
    switch (this.param) {
      case "python":
        await this.setup_notebook("python3");
        break;
      case "jupyter-r":
      case "r":
        await this.setup_notebook("ir");
        break;
      case "jupyter-bash":
        await this.setup_notebook("bash");
        break;
      case "octave":
      case "jupyter-octave":
        await this.setup_notebook("octave");
        break;
    }
  }

  // For some jupyter notebook kernels, initialize them.
  private async setup_notebook(kernel: Kernel) {
    if (this.path == null)
      throw new Error("WelcomeFile::setup_notebook path is not defined");
    let editor_actions: any;
    // inspired by nbgrader actions
    while (true) {
      editor_actions = redux.getEditorActions(this.project_id, this.path);
      if (editor_actions != null) break;
      await delay(200);
    }

    const jactions = editor_actions.jupyter_actions as JupyterActions;
    if (jactions.syncdb.get_state() == "init") {
      await once(jactions.syncdb, "ready");
    }
    jactions.set_kernel(kernel);
    await jactions.save(); // TODO how to make sure get_cell_list() has at least one cell?
    let cell_id: string = jactions.store.get_cell_list().first();

    WelcomeSetups[kernel].forEach((cell) => {
      jactions.set_cell_input(cell_id, cell.content);
      if (cell.type == "markdown") {
        jactions.set_cell_type(cell_id, "markdown");
      } else {
        jactions.runCells([cell_id]);
      }
      cell_id = jactions.insert_cell_adjacent(cell_id, +1);
    });
  }

  // Calling the "createFile" action will properly initialize certain files,
  // in particular .tex
  private async createFile(): Promise<void> {
    if (this.path == null)
      throw new Error("WelcomeFile::createFile – path is not defined");
    const project_actions = redux.getProjectActions(this.project_id);
    const { name, ext } = separate_file_extension(this.path);
    await project_actions.createFile({
      name,
      ext,
      current_path: "",
      switch_over: true,
    });
  }

  // Derive a file from the parameter value, which implies what to show.
  private make_path(): string | undefined {
    switch (this.param) {
      case "ipynb":
      case "jupyter":
      case "python":
      case "true":
        // TODO expand this first notebook to be a bit more exciting…
        return "Welcome to CoCalc.ipynb";
      case "r":
      case "jupyter-r":
      case "jupyter-bash":
      case "octave":
      case "jupyter-octave":
        // TODO: pre-select the R, bash or octave kernel
        return "Welcome to CoCalc.ipynb";
      case "linux":
      case "terminal":
        return "Welcome to CoCalc.term";
      case "sagews":
      case "sage":
        return "Welcome to CoCalc.sagews";
      case "latex":
        return "Welcome-to-CoCalc.tex";
      case "x11":
        return "Welcome to CoCalc.x11";
      default:
        console.warn(`Got unknown param=${this.param}`);
        return undefined;
    }
  }
}
