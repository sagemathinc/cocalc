/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Input } from "antd";
import { ReactNode, useEffect, useRef, useState } from "react";
import { useIsMountedRef } from "@cocalc/frontend/app-framework";
import { register, RenderElementProps } from "../register";
import { useSlate } from "../hooks";
import { SlateCodeMirror } from "../codemirror";
import { delay } from "awaiting";
import { useSetElement } from "../set-element";
import infoToMode from "./info-to-mode";
import ActionButtons, { RunFunction } from "./action-buttons";
import { useChange } from "../../use-change";
import { getHistory, isPreviousSiblingCodeBlock } from "./history";
import InsertBar from "./insert-bar";
import { useFileContext } from "@cocalc/frontend/lib/file-context";
import { isEqual } from "lodash";
import Mermaid from "./mermaid";

function Element({ attributes, children, element }: RenderElementProps) {
  if (element.type != "code_block") {
    throw Error("bug");
  }
  const { disableMarkdownCodebar } = useFileContext();
  const editor = useSlate();
  const isMountedRef = useIsMountedRef();
  const [info, setInfo] = useState<string>(element.info ?? "");
  const infoFocusedRef = useRef<boolean>(false);
  const [output, setOutput] = useState<null | ReactNode>(null);
  const runRef = useRef<RunFunction | null>(null);
  const setElement = useSetElement(editor, element);
  // textIndent: 0 is needed due to task lists -- see https://github.com/sagemathinc/cocalc/issues/6074
  const { change } = useChange();
  const [history, setHistory] = useState<string[]>(
    getHistory(editor, element) ?? [],
  );
  const [codeSibling, setCodeSibling] = useState<boolean>(
    isPreviousSiblingCodeBlock(editor, element),
  );
  useEffect(() => {
    const newHistory = getHistory(editor, element);
    if (newHistory != null && !isEqual(history, newHistory)) {
      setHistory(newHistory);
      setCodeSibling(isPreviousSiblingCodeBlock(editor, element));
    }
    if (!infoFocusedRef.current && element.info != info) {
      // upstream change
      setInfo(element.info);
    }
  }, [change, element]);

  return (
    <div {...attributes}>
      <div contentEditable={false} style={{ textIndent: 0 }}>
        {!codeSibling && (
          <InsertBar
            editor={editor}
            element={element}
            info={info}
            above={true}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1 }}>
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
              }}
              onBlur={async () => {
                await delay(0);
                if (!isMountedRef.current) return;
              }}
              onShiftEnter={() => {
                runRef.current?.();
              }}
              addonBefore={
                <div
                  style={{
                    borderBottom: "1px solid #ccc",
                    padding: "3px",
                    display: "flex",
                    background: "#f8f8f8",
                  }}
                >
                  <div style={{ flex: 1 }}></div>
                  {element.fence && (
                    <Input
                      size="small"
                      onKeyDown={(e) => {
                        if (e.keyCode == 13 && e.shiftKey) {
                          runRef.current?.();
                        } else if (e.keyCode == 40) {
                          // down arrow and 38 is up.  TODO
                        }
                      }}
                      style={{
                        flex: 1,
                        color: "#666",
                        minWidth: "100px",
                        maxWidth: "300px",
                        margin: "0 5px",
                      }}
                      placeholder="Info string (py, r, jl, tex, md, etc.)..."
                      value={info}
                      onFocus={() => {
                        infoFocusedRef.current = true;
                        editor.setIgnoreSelection(true);
                      }}
                      onBlur={() => {
                        infoFocusedRef.current = false;
                        editor.setIgnoreSelection(false);
                      }}
                      onChange={(e) => {
                        const info = e.target.value;
                        setInfo(info);
                        setElement({ info });
                      }}
                    />
                  )}
                  {!disableMarkdownCodebar && (
                    <ActionButtons
                      size="small"
                      input={element.value}
                      history={history}
                      setOutput={setOutput}
                      output={output}
                      info={info}
                      runRef={runRef}
                      setInfo={(info) => {
                        setElement({ info });
                      }}
                    />
                  )}
                </div>
              }
              addonAfter={
                disableMarkdownCodebar || output == null ? null : (
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
                    style={{
                      borderTop: "1px dashed #ccc",
                      background: "white",
                      padding: "5px 0 5px 30px",
                    }}
                  >
                    {output}
                  </div>
                )
              }
            />
          </div>
          {element.info == "mermaid" && (
            <Mermaid style={{ flex: 1 }} value={element.value} />
          )}
        </div>
        <InsertBar
          editor={editor}
          element={element}
          info={info}
          above={false}
        />
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
