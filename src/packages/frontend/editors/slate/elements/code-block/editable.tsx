/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  CSS,
  React,
  useState,
  useIsMountedRef,
} from "@cocalc/frontend/app-framework";
import { register, RenderElementProps } from "../register";
import { useCollapsed, useSelected, useSlate } from "../hooks";
import { SlateCodeMirror } from "../codemirror";
import { ensure_ends_in_newline, indent } from "../../util";
import { delay } from "awaiting";
import { useSetElement } from "../set-element";

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

  const setElement = useSetElement(editor, element);

  return (
    <div {...attributes}>
      <div contentEditable={false}>
        <SlateCodeMirror
          options={{ lineWrapping: true }}
          value={element.value}
          info={element.info}
          onChange={(value) => {
            //setElement(editor, elementRef.current, { value });
            setElement({ value });
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
              setElement({ info });
            }}
          />
        )}
      </div>
      {children}
    </div>
  );
};

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
  fromSlate,
  Element,
});

// The info editor.

const INFO_STYLE = {
  float: "right",
  position: "relative",
  width: "20ex",
  border: "1px solid #ccc",
  borderRadius: "5px",
  marginTop: "-3em",
  color: "#666",
  background: "#fafafa",
  padding: "0 5px",
  fontSize: "12px",
  height: "20px",
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
