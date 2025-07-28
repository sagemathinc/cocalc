/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Components for rendering input and output prompts.

ATTENTION: Be careful about adding other buttons here, since this component is also used by the whiteboard,
which has different constraints!  See

src/packages/frontend/frame-editors/whiteboard-editor/elements/code/input-prompt.tsx
*/

import React from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Tip } from "@cocalc/frontend/components/tip";
import { capitalize } from "@cocalc/util/misc";
import { INPUT_STYLE, InputPromptProps } from "./base";

export const InputPrompt: React.FC<InputPromptProps> = (props) => {
  function renderPrompt() {
    let n;
    if (props.type !== "code") {
      return <div style={INPUT_STYLE} />;
    }
    const kernel = capitalize(props.kernel != null ? props.kernel : "");
    let tip: string | React.JSX.Element = "Enter code to be evaluated.";
    // in timetravel or read only mode only state is "done".
    const state =
      props.actions == null || props.read_only ? "done" : props.state;
    switch (state) {
      case "start":
        n = <Icon name="arrow-circle-o-left" style={{ color: "#faad14" }} />;
        tip = `Sending to be evaluated using ${kernel}.`;
        break;
      case "run":
        n = <Icon name="hand" style={{ color: "#ff4d4f" }} />;
        tip = `Waiting for another cell to finish running. Will evaluate using ${kernel}.`;
        break;
      case "busy":
        n = (
          <Icon
            name="plus-circle-filled"
            style={{
              color: "#0a830a",
              animation: "loadingCircle 3s infinite linear",
            }}
          />
        );
        if (props.start != null) {
          tip = (
            <span>
              Running since <TimeAgo date={new Date(props.start)} /> using{" "}
              {kernel}.
            </span>
          );
        } else {
          tip = `Running using ${kernel}.`;
        }
        break;
      default:
        // done (or never run)
        if (props.exec_count) {
          n = props.exec_count;
          if (props.end != null) {
            tip = (
              <span>
                Evaluated <TimeAgo date={new Date(props.end)} /> using {kernel}.
              </span>
            );
          } else if (kernel) {
            tip = `Last evaluated using ${kernel}.`;
          }
        } else {
          n = " ";
        }
    }

    return (
      <div
        style={{
          ...INPUT_STYLE,
          cursor: "pointer",
          marginTop: "8.5px",
          ...props.style,
        }}
      >
        <Tip tip={tip} placement="top">
          In [{n}]:
        </Tip>
      </div>
    );
  }

  if (!props.read_only && props.dragHandle != null) {
    return (
      <div>
        <div style={{ float: "left" }}>{props.dragHandle}</div>
        {renderPrompt()}
      </div>
    );
  } else {
    return renderPrompt();
  }
};
