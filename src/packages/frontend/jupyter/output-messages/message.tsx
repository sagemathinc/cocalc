/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Handling of output messages.
*/

import Anser from "anser";
import type { Map } from "immutable";
import React from "react";

import type { JupyterActions } from "@cocalc/jupyter/redux/actions";
import { LLMTools } from "@cocalc/jupyter/types";
import { Input } from "./input";
import { InputDone } from "./input-done";
import { Data } from "./mime-types/data";
import { MoreOutput } from "./more-output";
import { NotImplemented } from "./not-implemented";
import { Stderr } from "./stderr";
import { Stdout } from "./stdout";
import { OUTPUT_STYLE, OUTPUT_STYLE_SCROLLED } from "./style";
import { Traceback } from "./traceback";

function Blank({}) {
  return null;
}

function messageComponent(message: Map<string, any>): any {
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
  if (message.get("transient") != null) {
    // none of the above match and it's a transient message, should not render anything.
    // E.g., {"transient": {"display_id": "b522bc679b384e39a52feaade4117916"}}},
    return Blank;
  }
  if (message.get("output_type") == "display_data") {
    // matches nothing we know how to render and it just a message about the output_type
    return Blank;
  }
  // Final fallback -- render an error looking message...  maybe this should be blank too, not sure.
  return NotImplemented;
}

interface CellOutputMessageProps {
  message: Map<string, any>;
  project_id?: string;
  directory?: string;
  actions?: JupyterActions; // optional  - not needed by most messages
  name?: string;
  id?: string; // optional, and not usually needed either; this is the id of the cell.  It is needed for iframe + windowing.
  index?: number;
  trust?: boolean; // is notebook trusted by the user (if not won't eval javascript)
}

export const CellOutputMessage: React.FC<CellOutputMessageProps> = React.memo(
  (props: CellOutputMessageProps) => {
    const C: any = messageComponent(props.message);
    return <C {...props} />;
  },
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
  llmTools?: LLMTools;
}

function shouldMemoize(prev, next) {
  return (
    next.output.equals(prev.output) &&
    next.scrolled === prev.scrolled &&
    next.trust === prev.trust
  );
}

export const CellOutputMessages: React.FC<CellOutputMessagesProps> = React.memo(
  ({
    output,
    actions,
    name,
    project_id,
    directory,
    scrolled,
    trust,
    id,
    llmTools,
  }: CellOutputMessagesProps) => {
    const obj: Map<string, any>[] = React.useMemo(
      () => messageList(output),
      [output],
    );

    const v: React.JSX.Element[] = [];
    // NOTE: hasIframes -- we do not switch the output mode to "scrolled" if there are iframes in the output,
    // due to it being too difficult to handle them combined with windowing/virtualization.
    // It's likely that if there are iframes, the output is just one big iframe and scrolled mode is
    // very unlikely to be what you want.
    let hasIframes: boolean = false;
    let hasError: boolean = false;
    let traceback: string = "";
    for (const n of numericallyOrderedKeys(obj)) {
      const mesg = obj[n];
      if (mesg != null) {
        if (mesg.get("traceback")) {
          hasError = true;
          traceback += mesg.get("traceback").join("\n") + "\n";
        }
        if (scrolled && !hasIframes && mesg.getIn(["data", "iframe"])) {
          hasIframes = true;
        }
        v.push(
          <CellOutputMessage
            key={n}
            index={n}
            message={mesg}
            project_id={project_id}
            directory={directory}
            actions={actions}
            name={name}
            trust={trust}
            id={id}
          />,
        );
      }
    }
    const help =
      hasError && id && actions && llmTools ? (
        <llmTools.toolComponents.LLMError
          style={{ margin: "5px 0" }}
          input={actions.store.getIn(["cells", id, "input"]) ?? ""}
          traceback={Anser.ansiToText(traceback.trim())}
        />
      ) : undefined;

    return (
      <div
        style={scrolled && !hasIframes ? OUTPUT_STYLE_SCROLLED : OUTPUT_STYLE}
        className="cocalc-jupyter-rendered"
      >
        {help}
        {v}
      </div>
    );
  },
  shouldMemoize,
);

function numericallyOrderedKeys(obj: object): number[] {
  const v: number[] = [];
  for (const n in obj) {
    v.push(parseInt(n));
  }
  v.sort((a, b) => a - b);
  return v;
}

function messageList(output: Map<string, any>): Map<string, any>[] {
  const v: any[] = [];
  let k = 0;
  for (let n = 0, end = output.size; n < end; n++) {
    const mesg = output.get(`${n}`);
    // Make this renderer robust against any possible weird shape of the actual
    // output object, e.g., undefined or not immutable js.
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
