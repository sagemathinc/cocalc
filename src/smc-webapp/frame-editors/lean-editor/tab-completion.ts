/*
Register a CodeMirror hinter for the mode with name 'lean'.

*/

import * as CodeMirror from "codemirror";

import { startswith } from "../generic/misc";

import { Completion } from "./types";

import { Actions } from "./actions";

async function leanHint(
  cm: CodeMirror.Editor
): Promise<{ list: string[]; from: any; to: any } | void> {
  var cur = cm.getDoc().getCursor(),
    token = cm.getTokenAt(cur);

  // First start with list of completions coming from
    // the syntax highlighting mode.
  const list: string[] = (CodeMirror as any).hint.anyword(cm).list;

  // completions coming from the syntax highlighting mode.

  if ((cm as any).cocalc_actions !== undefined) {
    // completions coming from backend LEAN server.

    const actions: Actions = (cm as any).cocalc_actions;

    const resp: Completion[] = await actions.complete(cur.line, cur.ch);

    // First show those that match token.string, then show the rest.
    const second: string[] = [];
    for (let i = 0; i < resp.length; i++) {
      if (startswith(resp[i].text, token.string)) {
        list.push(resp[i].text);
      } else {
        second.push(resp[i].text);
      }
    }
    for (let i = 0; i < second.length; i++) {
      list.push(second[i]);
    }
  }

  return {
    list,
    from: CodeMirror.Pos(cur.line, token.start),
    to: CodeMirror.Pos(cur.line, token.end)
  };
}

CodeMirror.registerHelper("hint", "lean", leanHint);
