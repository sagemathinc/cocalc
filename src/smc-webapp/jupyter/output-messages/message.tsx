/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Handling of output messages.
*/

import { NotebookFrameActions } from "../../frame-editors/jupyter-editor/cell-notebook/actions";
import { React, Component, Rendered } from "smc-webapp/app-framework";
import { JupyterActions } from "../actions";
import { Map } from "immutable";
import { OUTPUT_STYLE, OUTPUT_STYLE_SCROLLED } from "./style";
import { MoreOutput } from "./more-output";
import { Stdout } from "./stdout";
import { Stderr } from "./stderr";
import { Input } from "./input";
import { InputDone } from "./input-done";
import { Data } from "./data";
import { Traceback } from "./traceback";
import { NotImplemented } from "./not-implemented";

function message_component(message: Map<string, any>): any {
  if (message.get("more_output") != null) {
    return MoreOutput;
  }
  if (message.get("name") === "stdout") {
    return Stdout;
  }
  if (message.get("name") === "stderr") {
    return Stderr;
  }
  if (message.get("name") === "input") {
    if (message.get("value") != null) {
      return InputDone;
    } else {
      return Input;
    }
  }
  if (message.get("data") != null) {
    return Data;
  }
  if (message.get("traceback") != null) {
    return Traceback;
  }
  return NotImplemented;
}

interface CellOutputMessageProps {
  message: Map<string, any>;
  project_id?: string;
  directory?: string;
  actions?: JupyterActions; // optional  - not needed by most messages
  frame_actions?: NotebookFrameActions;
  name?: string;
  id?: string; // optional, and not usually needed either
  trust?: boolean; // is notebook trusted by the user (if not won't eval javascript)
}

export class CellOutputMessage extends Component<CellOutputMessageProps> {
  render() {
    const C: any = message_component(this.props.message);
    return (
      <C
        message={this.props.message}
        project_id={this.props.project_id}
        directory={this.props.directory}
        actions={this.props.actions}
        frame_actions={this.props.frame_actions}
        name={this.props.name}
        trust={this.props.trust}
        id={this.props.id}
      />
    );
  }
}

interface CellOutputMessagesProps {
  output: Map<string, any>; // the actual messages
  actions?: any; // optional actions
  frame_actions?: NotebookFrameActions;
  name?: string;
  project_id?: string;
  directory?: string;
  scrolled?: boolean;
  trust?: boolean;
  id?: string;
}

export class CellOutputMessages extends Component<CellOutputMessagesProps> {
  shouldComponentUpdate(nextProps): boolean {
    return (
      !nextProps.output.equals(this.props.output) ||
      nextProps.scrolled !== this.props.scrolled ||
      nextProps.trust !== this.props.trust
    );
  }

  render_output_message(n: string, mesg: Map<string, any>): Rendered {
    return (
      <CellOutputMessage
        key={n}
        message={mesg}
        project_id={this.props.project_id}
        directory={this.props.directory}
        actions={this.props.actions}
        frame_actions={this.props.frame_actions}
        name={this.props.name}
        trust={this.props.trust}
        id={this.props.id}
      />
    );
  }

  message_list = (): Map<string, any>[] => {
    const v: any[] = [];
    let k = 0;
    // TODO: use caching to make this more efficient...
    for (
      let n = 0, end = this.props.output.size, asc = 0 <= end;
      asc ? n < end : n > end;
      asc ? n++ : n--
    ) {
      const mesg = this.props.output.get(`${n}`);
      // Make this renderer robust against any possible weird shape of the actual
      // output object, e.g., undefined or not immmutable js.
      // Also, we're checking that get is defined --
      //   see https://github.com/sagemathinc/cocalc/issues/2404
      if (mesg == null || typeof mesg.get != "function") {
        console.warn(`Jupyter -- ignoring invalid mesg ${mesg}`);
        continue;
      }
      const name = mesg.get("name");
      if (
        k > 0 &&
        (name === "stdout" || name === "stderr") &&
        v[k - 1].get("name") === name
      ) {
        // combine adjacent stdout / stderr messages...
        let text = mesg.get("text");
        if (typeof text != "string") {
          text = `${text}`;
        }
        v[k - 1] = v[k - 1].set(
          "text",
          v[k - 1].get("text") + mesg.get("text")
        );
      } else {
        v[k] = mesg;
        k += 1;
      }
    }
    return v;
  };

  render(): Rendered {
    // (yes, I know n is a string in the next line, but that's fine since it is used only as a key)
    const v: Rendered[] = [];
    const object: Map<string, any>[] = this.message_list();
    let n: string;
    for (n in object) {
      const mesg = object[n];
      if (mesg != null) {
        v.push(this.render_output_message(n, mesg));
      }
    }
    return (
      <div
        style={this.props.scrolled ? OUTPUT_STYLE_SCROLLED : OUTPUT_STYLE}
        className="cocalc-jupyter-rendered"
      >
        {v}
      </div>
    );
  }
}
