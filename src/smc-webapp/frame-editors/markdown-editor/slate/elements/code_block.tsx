/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  CSS,
  React,
  useState,
  useIsMountedRef,
} from "../../../../app-framework";
import { Element as Element0, Transforms } from "slate";
import {
  register,
  SlateElement,
  RenderElementProps,
  useCollapsed,
  useSelected,
  useSlate,
} from "./register";
import { SlateCodeMirror } from "./codemirror";
import { ensure_ends_in_newline, indent } from "../util";
import { delay } from "awaiting";

export interface CodeBlock extends SlateElement {
  type: "code_block";
  isVoid: true;
  fence: boolean;
  value: string;
  info: string;
}

const Element: React.FC<RenderElementProps> = ({
  attributes,
  children,
  element,
}) => {
  if (element.type != "code_block") throw Error("bug");
  const editor = useSlate();
  const selected = useSelected();
  const collapsed = useCollapsed();
  const isMountedRef = useIsMountedRef();

  const [showInfo, setShowInfo] = useState<boolean>(selected && collapsed); // show the info input
  const [focusInfo, setFocusInfo] = useState<boolean>(false); // focus the info input

  return (
    <div {...attributes}>
      <div contentEditable={false}>
        <SlateCodeMirror
          options={{ lineWrapping: true }}
          value={element.value}
          info={element.info}
          onChange={(value) => {
            Transforms.setNodes(editor, { value } as any, {
              match: (node) => node["type"] == "code_block",
            });
          }}
          onFocus={async () => {
            await delay(1); // must be a little longer than the onBlur below.
            if (!isMountedRef.current) return;
            setShowInfo(true);
          }}
          onBlur={async () => {
            await delay(0);
            if (!isMountedRef.current) return;
            if (!focusInfo) {
              setShowInfo(false);
            }
          }}
        />
        {element.fence && (showInfo || focusInfo) && (
          <InfoEditor
            value={element.info}
            onFocus={() => {
              setFocusInfo(true);
            }}
            onBlur={() => {
              setShowInfo(false);
              setFocusInfo(false);
            }}
            onChange={(info) => {
              Transforms.setNodes(editor, { info } as any, {
                match: (node) => node["type"] == "code_block",
              });
            }}
          />
        )}
      </div>
      {children}
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
    children: [{ text: " " }],
  } as Element0;
}

function fromSlate({ node }) {
  const value = node.value as string;
  if (node.fence) {
    const info = node.info.trim() ?? "";
    // There is one special case with fenced codeblocks that we
    // have to worry about -- if they contain ```, then we need
    // to wrap with *more* than the max sequence of backticks
    // actually in the codeblock!   See
    //    https://stackoverflow.com/questions/49267811/how-can-i-escape-3-backticks-code-block-in-3-backticks-code-block
    // for an excellent discussion of this, and also
    // https://github.com/mwouts/jupytext/issues/712
    let fence = "```";
    while (value.indexOf(fence) != -1) {
      fence += "`";
    }
    return fence + info + "\n" + ensure_ends_in_newline(value) + fence + "\n\n";
  } else {
    return indent(ensure_ends_in_newline(value), 4) + "\n";
  }
}

register({
  slateType: "code_block",
  markdownType: ["fence", "code_block"],
  fromSlate,
  Element,
  toSlate,
  rules: { autoFocus: true },
});

// The info editor.

const INFO_STYLE = {
  float: "right",
  position: "relative",
  width: "10em",
  border: "1px solid #ccc",
  borderRadius: "5px",
  marginTop: "-3em",
  color: "#666",
  background: "#fafafa",
  padding: "0 5px",
  fontSize: "12px",
} as CSS;

interface InfoProps {
  onFocus: () => void;
  onBlur: () => void;
  onChange: (string) => void;
  value: string;
}

const InfoEditor: React.FC<InfoProps> = ({
  onBlur,
  onChange,
  onFocus,
  value,
}) => {
  return (
    <textarea
      style={INFO_STYLE}
      rows={1}
      onFocus={onFocus}
      onBlur={onBlur}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={"Language..."}
    />
  );
};
