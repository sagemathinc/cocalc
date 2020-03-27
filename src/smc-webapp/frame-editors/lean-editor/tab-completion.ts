/*
Register a CodeMirror hinter for the mode with name 'lean'.

*/

import * as CodeMirror from "codemirror";

import { Completion } from "./types";

import { Actions } from "./actions";

import { completions } from "smc-webapp/codemirror/mode/lean";

interface CMCompletion {
  text: string;
  displayText: string;
}

async function leanHint(
  cm: CodeMirror.Editor
): Promise<{ list: CMCompletion[]; from: any; to: any } | void> {
  const cur = cm.getDoc().getCursor(),
    token = cm.getTokenAt(cur);

  const set: any = {};
  const list: CMCompletion[] = [];
  function include(words: string[]): void {
    for (const word of words) {
      if (!set[word]) {
        set[word] = true;
        list.push({ text: word, displayText: `◇ ${word}` });
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
    for (let i = 0; i < resp.length; i++) {
      const { text, type } = resp[i];
      const displayText = `▣ ${text} : ${type}`;
      list.push({ text, displayText });
    }
  }

  return {
    list,
    from: CodeMirror.Pos(cur.line, token.start),
    to: CodeMirror.Pos(cur.line, token.end),
  };
}

CodeMirror.registerHelper("hint", "lean", leanHint);
