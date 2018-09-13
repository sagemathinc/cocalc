/*
Register a CodeMirror hinter for the mode with name 'lean'.

*/

import * as CodeMirror from "codemirror";

import { startswith } from "../generic/misc";

import { Completion } from "./types";

import { Actions } from "./actions";

import { completions } from "smc-webapp/codemirror/mode/lean";

async function leanHint(
  cm: CodeMirror.Editor
): Promise<{ list: string[]; from: any; to: any } | void> {
  var cur = cm.getDoc().getCursor(),
    token = cm.getTokenAt(cur);

  const set: any = {};
  const list: string[] = [];
  function include(words: string[]): void {
    for (let word of words) {
      if (!set[word]) {
        set[word] = true;
        list.push(word);
      }
    }
  }

  // First start with list of completions coming from
  // the syntax highlighting mode.
  let t = (CodeMirror as any).hint.anyword(cm);
  if (t != null && t.list != null) {
    include(t.list);
  }

  // We have to also do this, since the above misses words that haven't already been highlighted!
  t = (CodeMirror as any).hint.fromList(cm, { words: completions });
  if (t != null && t.list != null) {
    include(t.list);
  }

  list.sort();

  // completions coming from backend LEAN server.
  if ((cm as any).cocalc_actions !== undefined) {
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
