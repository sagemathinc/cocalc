/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { ReactNode, useEffect, useRef, useState } from "react";
import { useIsMountedRef } from "@cocalc/frontend/app-framework";
import { register, RenderElementProps } from "../register";
import { useCollapsed, useSelected, useSlate } from "../hooks";
import { SlateCodeMirror } from "../codemirror";
import { delay } from "awaiting";
import { useSetElement } from "../set-element";
import { Input } from "antd";
import infoToMode from "./info-to-mode";
import ActionButtons, { RunFunction } from "./action-buttons";
import { useChange } from "../../use-change";
import { getHistory } from "./history";

function Element({ attributes, children, element }: RenderElementProps) {
  if (element.type != "code_block") {
    throw Error("bug");
  }
  const editor = useSlate();
  const selected = useSelected();
  const collapsed = useCollapsed();
  const isMountedRef = useIsMountedRef();

  const [showInfo, setShowInfo] = useState<boolean>(selected && collapsed); // show the info input
  const [focusInfo, setFocusInfo] = useState<boolean>(false); // focus the info input
  const [output, setOutput] = useState<null | ReactNode>(null);

  const runRef = useRef<RunFunction | null>(null);

  const setElement = useSetElement(editor, element);
  // textIndent: 0 is needed due to task lists -- see https://github.com/sagemathinc/cocalc/issues/6074
  const { change } = useChange();
  const [history, setHistory] = useState<string[]>(getHistory(editor, element));
  useEffect(() => {
    setHistory(getHistory(editor, element));
  }, [change]);

  return (
    <div {...attributes}>
      <div
        contentEditable={false}
        style={{ textIndent: 0, marginBottom: "1em" }}
      >
        <ActionButtons
          input={element.value}
          history={history}
          setOutput={setOutput}
          output={output}
          info={element.info}
          runRef={runRef}
        />
        <SlateCodeMirror
          options={{ lineWrapping: true }}
          value={element.value}
          info={infoToMode(element.info, { value: element.value })}
          onChange={(value) => {
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
          onShiftEnter={() => {
            runRef.current?.();
          }}
        />
        {element.fence && (true || showInfo || focusInfo) && (
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
        <div
          onMouseDown={() => {
            editor.setIgnoreSelection(true);
          }}
          onMouseUp={() => {
            // Re-enable slate listing for selection changes again in next render loop.
            setTimeout(() => {
              editor.setIgnoreSelection(false);
            }, 0);
          }}
        >
          {output}
        </div>
      </div>
      {children}
    </div>
  );
}

function fromSlate({ node }) {
  const value = node.value as string;

  // We always convert them to fenced, because otherwise collaborative editing just
  // isn't possible, e.g., because you can't have blank lines at the end.  This isn't
  // too bad, since the conversion only happens for code blocks you actually touch.
  if (true || node.fence) {
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
    return fence + info + "\n" + value + "\n" + fence + "\n\n";
    // this was the old code for non-fenced blocks:
    //   } else {
    //     return indent(value, 4) + "\n\n";
  }
}

register({
  slateType: "code_block",
  fromSlate,
  Element,
  rules: {
    autoFocus: true,
    autoAdvance: true,
  },
});

// The info editor.

const INFO_STYLE = {
  float: "right",
  position: "relative",
  width: "100px",
  border: "1px solid #ccc",
  borderRadius: "5px",
  color: "#666",
  background: "#fafafa",
  padding: "0 5px",
  fontSize: "12px",
  height: "18px",
  margin: "-20px 1px 0 0",
} as const;

interface InfoProps {
  onFocus: () => void;
  onBlur: () => void;
  onChange: (string) => void;
  value: string;
}

function InfoEditor({ onBlur, onChange, onFocus, value }: InfoProps) {
  return (
    <Input
      size="small"
      placeholder="Language..."
      style={INFO_STYLE}
      onFocus={onFocus}
      onBlur={onBlur}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
