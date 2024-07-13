/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { createWidgetManager } from "@cocalc/widgets";
import type {
  WidgetEnvironment,
  Comm,
  WidgetManager as UpstreamWidgetManager,
} from "@cocalc/widgets";
import { IpywidgetsState } from "@cocalc/sync/editor/generic/ipywidgets-state";
import { once } from "@cocalc/util/async-utils";

export type SendCommFunction = (string, data) => string;

export class WidgetManager {
  public ipywidgets_state: IpywidgetsState;
  public manager: UpstreamWidgetManager;

  constructor(ipywidgets_state: IpywidgetsState) {
    this.ipywidgets_state = ipywidgets_state;
    if (this.ipywidgets_state.get_state() == "closed") {
      throw Error("ipywidgets_state must not be closed");
    }
    const provider = new Environment(this);
    this.manager = createWidgetManager(provider);
  }
}

class Environment implements WidgetEnvironment {
  private manager: WidgetManager;
  constructor(manager) {
    this.manager = manager;
  }

  async getModelState(modelId) {
    if (this.manager.ipywidgets_state.get_state() != "ready") {
      await once(this.manager.ipywidgets_state, "ready");
    }
    const state = this.manager.ipywidgets_state.get_model_state(modelId);
    if (!state) {
      return undefined;
    }
    return {
      modelName: state._model_name,
      modelModule: state._model_module,
      modelModuleVersion: state._model_module_version,
      state,
    };
  }

  async openCommChannel(
    targetName: string,
    data?: unknown,
    buffers?: ArrayBuffer[],
  ): Promise<Comm> {
    console.log("openCommChannel", { targetName, data, buffers });
    const comm = {
      send(data: unknown, opts?: { buffers?: ArrayBuffer[] }) {
        return new Promise<void>((resolve, _reject) => {
          console.log("Data sent:", data, "With options:", opts);
          resolve();
        });
      },

      close() {
        console.log("Connection closed");
      },

      get messages() {
        const message = {
          data: "Hello",
          buffers: [new ArrayBuffer(8)],
        };
        return {
          [Symbol.asyncIterator]: async function* () {
            yield message;
          },
        };
      },
    };
    return comm;
  }

  async renderOutput(outputItem: unknown, destination: Element): Promise<void> {
    console.log("renderOutput", { outputItem, destination });
  }
}
