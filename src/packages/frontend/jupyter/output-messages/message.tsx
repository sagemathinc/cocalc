/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Handling of output messages.
*/

import { React, Rendered } from "@cocalc/frontend/app-framework";
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
  name?: string;
  id?: string; // optional, and not usually needed either
  trust?: boolean; // is notebook trusted by the user (if not won't eval javascript)
}

export const CellOutputMessage: React.FC<CellOutputMessageProps> = React.memo(
  (props: CellOutputMessageProps) => {
    const C: any = message_component(props.message);
    return (
      <C
        message={props.message}
        project_id={props.project_id}
        directory={props.directory}
        actions={props.actions}
        name={props.name}
        trust={props.trust}
        id={props.id}
      />
    );
  }
);

interface CellOutputMessagesProps {
  output: Map<string, any>; // the actual messages
  actions?: any; // optional actions
  name?: string;
  project_id?: string;
  directory?: string;
  scrolled?: boolean;
  trust?: boolean;
  id?: string;
}

function should_memoize(prev, next) {
  return (
    next.output.equals(prev.output) &&
    next.scrolled === prev.scrolled &&
    next.trust === prev.trust
  );
}

export const CellOutputMessages: React.FC<CellOutputMessagesProps> = React.memo(
  (props: CellOutputMessagesProps) => {
    const {
      output,
      actions,
      name,
      project_id,
      directory,
      scrolled,
      trust,
      id,
    } = props;

    function render_output_message(
      n: string,
      mesg: Map<string, any>
    ): Rendered {
      return (
        <CellOutputMessage
          key={n}
          message={mesg}
          project_id={project_id}
          directory={directory}
          actions={actions}
          name={name}
          trust={trust}
          id={id}
        />
      );
    }

    function message_list(): Map<string, any>[] {
      const v: any[] = [];
      let k = 0;
      for (let n = 0, end = output.size; n < end; n++) {
        const mesg = output.get(`${n}`);
        // Make this renderer robust against any possible weird shape of the actual
        // output object, e.g., undefined or not immmutable js.
        // Also, we're checking that get is defined --
        //   see https://github.com/sagemathinc/cocalc/issues/2404
        if (mesg == null || typeof mesg.get !== "function") {
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
          if (typeof text !== "string") {
            text = `${text}`;
          }
          const merged = v[k - 1].get("text") + mesg.get("text");
          v[k - 1] = v[k - 1].set("text", merged);
        } else {
          v[k] = mesg;
          k += 1;
        }
      }
      return v;
    }

    // for the same output map, we derive the same list of objects
    const object: Map<string, any>[] = React.useMemo(message_list, [output]);

    const v: Rendered[] = [];
    // (yes, I know n is a string in the next line, but that's fine since it is used only as a key)
    let n: string;
    for (n in object) {
      const mesg = object[n];
      if (mesg != null) {
        v.push(render_output_message(n, mesg));
      }
    }
    return (
      <div
        style={scrolled ? OUTPUT_STYLE_SCROLLED : OUTPUT_STYLE}
        className="cocalc-jupyter-rendered"
      >
        {v}
      </div>
    );
  },
  should_memoize
);
