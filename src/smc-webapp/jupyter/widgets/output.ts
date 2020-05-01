/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as outputBase from "@jupyter-widgets/output";

export class OutputModel extends outputBase.OutputModel {
  private _outputs: any;
  widget_manager: any;

  defaults() {
    return {
      ...super.defaults(),
      msg_id: "",
    };
  }

  initialize(attributes: any, options: any) {
    super.initialize(attributes, options);
    this._outputs = { attributes, options };
  }

  get outputs() {
    return this._outputs;
  }
}

export class OutputView extends outputBase.OutputView {
  model: OutputModel;

  render() {
    console.log("render", this.model.outputs);
  }
}
