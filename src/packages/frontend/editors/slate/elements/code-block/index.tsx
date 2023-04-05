/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React, { ReactNode, useEffect, useState } from "react";
import { Element } from "slate";
import { register, SlateElement, RenderElementProps } from "../register";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import infoToMode from "./info-to-mode";
import ActionButtons from "./action-buttons";
import { useChange } from "../../use-change";
import { getHistory } from "./history";

export interface CodeBlock extends SlateElement {
  type: "code_block";
  isVoid: true;
  fence: boolean;
  value: string;
  info: string;
}

const StaticElement: React.FC<RenderElementProps> = ({
  attributes,
  element,
}) => {
  const [output, setOutput] = useState<null | ReactNode>(null);

  const { change, editor } = useChange();
  const [history, setHistory] = useState<string[]>(getHistory(editor, element));
  useEffect(() => {
    setHistory(getHistory(editor, element));
  }, [change]);

  if (element.type != "code_block") {
    throw Error("bug");
  }
  // textIndent: 0 is needed due to task lists -- see https://github.com/sagemathinc/cocalc/issues/6074
  return (
    <div {...attributes} style={{ marginBottom: "1em", textIndent: 0 }}>
      <CodeMirrorStatic
        addonAfter={
          <ActionButtons
            input={element.value}
            history={history}
            setOutput={setOutput}
            output={output}
            info={element.info}
          />
        }
        value={element.value}
        style={{ background: "white", padding: "15px" }}
        options={{ mode: infoToMode(element.info, { value: element.value }) }}
      />
      {output}
    </div>
  );
};

function toSlate({ token }) {
  // fence =block of code with ``` around it, but not indented.
  let value = token.content;

  // We remove the last carriage return (right before ```), since it
  // is much easier to do that here...
  if (value[value.length - 1] == "\n") {
    value = value.slice(0, value.length - 1);
  }
  const info = token.info ?? "";
  if (typeof info != "string") {
    throw Error("info must be a string");
  }
  return {
    type: "code_block",
    isVoid: true,
    fence: token.type == "fence",
    value,
    info,
    children: [{ text: "" }],
  } as Element;
}

function sizeEstimator({ node, fontSize }): number {
  return node.value.split("\n").length * (fontSize + 2) + 10 + fontSize;
}

register({
  slateType: "code_block",
  markdownType: ["fence", "code_block"],
  StaticElement,
  toSlate,
  sizeEstimator,
});
