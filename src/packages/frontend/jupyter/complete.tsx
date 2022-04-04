/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

declare const $: any;

import { CSSProperties, useEffect, useRef } from "react";
import { Map } from "immutable";
import useNotebookFrameActions from "@cocalc/frontend/frame-editors/jupyter-editor/cell-notebook/hook";

// e.g., this is a subset of { JupyterActions } from "./browser-actions";
export interface Actions {
  select_complete: (
    id: string,
    item: string,
    complete?: Map<string, any>
  ) => void;
  complete_handle_key: (_: string, keyCode: number) => void;
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
    $(window).on("keypress", keypress);
    $(nodeRef.current).find("a:first").focus();
    return () => {
      $(window).off("keypress", keypress);
    };
  }, []);

  function select(item: string): void {
    // Save contents of editor to the store so that completion properly *places* the
    // completion in the correct place: see https://github.com/sagemathinc/cocalc/issues/3978
    frameActions.current?.save_input_editor(id);

    // Actually insert the completion:
    actions.select_complete(id, item);

    // Start working on the cell:
    frameActions.current?.set_mode("edit");
  }

  function renderItem(item: string) {
    return (
      <li key={item}>
        <a role="menuitem" tabIndex={-1} onClick={() => select(item)}>
          {item}
        </a>
      </li>
    );
  }

  function keypress(evt: any) {
    actions.complete_handle_key(id, evt.keyCode);
  }

  function key(e: any): void {
    if (e.keyCode === 27) {
      actions.clear_complete();
      frameActions.current?.set_mode("edit");
    }
    if (e.keyCode !== 13) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const item = $(nodeRef.current).find("a:focus").text();
    select(item);
  }

  function getStyle(): CSSProperties {
    const top = complete.getIn(["offset", "top"], 0);
    const left = complete.getIn(["offset", "left"], 0);
    const gutter = complete.getIn(["offset", "gutter"], 0);
    return {
      cursor: "pointer",
      top: top + "px",
      left: left + gutter + "px",
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
