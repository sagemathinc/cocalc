/*
Keep track of open Jupyter kernels.
*/

import { EventEmitter } from "events";
import { type JupyterKernel } from "./kernel";

class Kernels extends EventEmitter {
  kernels: { [path: string]: JupyterKernel } = {};

  get = (path: string): JupyterKernel | undefined => this.kernels[path];

  set = (path: string, kernel: JupyterKernel) => {
    this.kernels[path] = kernel;
    this.emit(path, kernel);
  };

  delete = (path: string) => {
    delete this.kernels[path];
  };
}

export const kernels = new Kernels();
