/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

declare const $: any;

import { Tag, Tooltip } from "antd";
import { CSSProperties, useEffect, useMemo, useRef } from "react";
import { Map } from "immutable";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";

// e.g., this is a subset of { JupyterActions } from "./browser-actions";
export interface Actions {
  select_complete: (
    id: string,
    item: string,
    complete?: Map<string, any>,
  ) => void;
  clear_complete: () => void;
}

interface Props {
  actions: Actions;
  id: string;
  complete: Map<string, any>;
}

// WARNING: Complete closing when clicking outside the complete box
// is handled in cell-list on_click.  This is ugly code (since not localized),
// but seems to work well for now.  Could move.
export function Complete({ actions, id, complete }: Props) {
  const frameActions = useNotebookFrameActions();

  const nodeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    $(nodeRef.current).find("a:first").focus();
    return () => {
      // No matter what, when the complete dialog goes away, restore focus
      // and edit mode to the cell.
      frameActions.current?.set_mode("edit");
    };
  }, []);

  const typeInfo = useMemo(() => {
    const types = complete?.getIn(["metadata", "_jupyter_types_experimental"]);
    if (types == null) {
      return {};
    }
    const typeInfo: { [text: string]: { type: string; signature: string } } =
      {};
    // @ts-ignore
    for (const info of types) {
      const text = info.get("text");
      if (typeInfo[text] == null) {
        typeInfo[text] = {
          type: info.get("type"),
          signature: info.get("signature"),
        };
      }
    }
    return typeInfo;
  }, [complete]);

  function select(item: string): void {
    // Save contents of editor to the store so that completion properly *places* the
    // completion in the correct place: see https://github.com/sagemathinc/cocalc/issues/3978
    frameActions.current?.save_input_editor(id);

    // Actually insert the completion:
    actions.select_complete(id, item);
  }

  function renderItem(item: string) {
    return (
      <li key={item}>
        <a
          role="menuitem"
          style={{ display: "flex", fontSize: "13px" }}
          tabIndex={-1}
          onClick={() => select(item)}
          data-item={item}
        >
          {item}
          {typeInfo[item]?.type ? (
            <Tooltip title={`${item}${typeInfo[item].signature}`}>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    float: "right",
                    marginLeft: "30px",
                    color: "#0000008a",
                    fontFamily: "monospace",
                  }}
                >
                  <Tag color={typeToColor[typeInfo[item].type]}>
                    {typeInfo[item].type}
                  </Tag>
                </div>
              </div>
            </Tooltip>
          ) : null}
        </a>
      </li>
    );
  }

  function key(e: any): void {
    if (e.keyCode === 27) {
      actions.clear_complete();
    }
    if (e.keyCode !== 13) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const item = $(nodeRef.current).find("a:focus").data("item");
    select(item);
  }

  function getStyle(): CSSProperties {
    const top = complete.getIn(["offset", "top"], 0) as number;
    const left = complete.getIn(["offset", "left"], 0) as number;
    const gutter = complete.getIn(["offset", "gutter"], 0) as number;
    return {
      cursor: "pointer",
      top: top + 15 + "px",
      left: left + 100 + gutter + "px",
      zIndex: 10,
      width: 0,
      height: 0,
      position: "absolute",
    };
  }

  return (
    <div className="dropdown open" style={getStyle()} ref={nodeRef}>
      <ul className="dropdown-menu cocalc-complete" onKeyDown={key}>
        {complete.get("matches", []).map(renderItem)}
      </ul>
    </div>
  );
}

const typeToColor = {
  function: "blue",
  statement: "green",
  module: "cyan",
  class: "orange",
  instance: "magenta",
  "<unknown>": "red",
  path: "gold",
  keyword: "purple",
  magic: "geekblue",
  param: "volcano",
};
