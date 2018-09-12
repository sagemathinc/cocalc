/*
Register a CodeMirror hinter for the mode with name 'lean'.

*/

import * as CodeMirror from "codemirror";

import { Actions } from "./actions";

async function leanHint(
  cm: CodeMirror.Editor
): Promise<{ list: string[]; from: any; to: any } | void> {
  var cur = cm.getDoc().getCursor(),
    token = cm.getTokenAt(cur);

  if ((cm as any).cocalc_actions === undefined) {
    return;
  }
  const actions: Actions = (cm as any).cocalc_actions;

  const list = await actions.complete(cur.line, cur.ch);

  return {
    list,
    from: CodeMirror.Pos(cur.line, token.start),
    to: CodeMirror.Pos(cur.line, token.end)
  };
}

CodeMirror.registerHelper("hint", "lean", leanHint);
