/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Save and restore the scroll position of a cm editor in a JSON-friendly format,
so it can be stored in local storage.

This is extremely hard if the user has word wrap on since every wrapped line changes the total
editor height, and the Codemirror API not providing a simple way to deal with this.
*/

import { delay } from "awaiting";

import * as CodeMirror from "codemirror";

const VERSION: number = 2;

interface Position {
  line: number;
  ch: number;
}

interface State {
  pos: Position;
  sel: { anchor: Position; head: Position }[];
  ver: number;
}

export function get_state(cm: CodeMirror.Editor): State | undefined {
  const doc: CodeMirror.Doc = cm.getDoc();
  const info = cm.getScrollInfo();
  if (info.height <= 0) {
    // The editor view not properly configured yet (get negative values) -- ignore;
    // this was the source of https://github.com/sagemathinc/cocalc/issues/2801
    return;
  }
  const coords = cm.coordsChar(info, "local");
  const pos = { line: coords.line, ch: coords.ch };
  const state = {
    pos,
    sel: doc.listSelections(),
    ver: VERSION,
  };
  //console.log 'get_state', info, state.pos
  return state;
}

export async function set_state(
  cm: CodeMirror.Editor,
  state: State
): Promise<void> {
  if (state.ver < VERSION) {
    return; // ignore old version.
  }

  const elt = $(cm.getWrapperElement()).find(".CodeMirror-scroll");
  if (state.pos) {
    elt.css("opacity", 0);
    // We **have to** do the scrollTo in the next render loop, since otherwise
    // the coords below will return the sizing data about
    // the cm instance before the above css font-size change has been rendered.
    // Also, the opacity business avoids some really painful "flicker".
    await delay(0);
    // now in next render loop
    elt.css("opacity", 1);
    cm.scrollTo(0, cm.cursorCoords(state.pos, "local").top);
    cm.refresh();
  }
  if (state.sel) {
    cm.getDoc().setSelections(state.sel);
  }
}
