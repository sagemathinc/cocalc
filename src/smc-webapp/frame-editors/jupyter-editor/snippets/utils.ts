/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { pick } from "lodash";
import { Snippets, SnippetEntry, SnippetDoc } from "./types";

// this derives the "snippets" datastrcture from the given data
// if there is no or an empty string set, it's only purpose is to filter out empty snippet blocks
export function filter_snippets(raw: Snippets, str?: string) {
  const res: Snippets = {};
  const ss = (str ?? "").toLowerCase(); // actual search string
  for (const [k1, lvl1] of Object.entries(raw)) {
    for (const [k2, lvl2] of Object.entries(lvl1)) {
      const entries = lvl2.entries.filter((doc: SnippetDoc) => {
        if (ss == "") return true;
        const inLvl1 = k1.toLowerCase().indexOf(ss) != -1;
        const inLvl2 = k2.toLowerCase().indexOf(ss) != -1;
        const title = doc[0];
        const descr = doc[1][1];
        const inTitle = title.toLowerCase().indexOf(ss) != -1;
        const inDescr = descr.toLowerCase().indexOf(ss) != -1;
        return inLvl1 || inLvl2 || inTitle || inDescr;
      });
      if (entries.length > 0) {
        if (res[k1] == null) res[k1] = {};
        res[k1][k2] = {
          entries,
          ...pick(lvl2, ["setup", "variables"]),
        };
      }
    }
  }
  return res;
}

function generate_setup_code_extra(args): string | undefined {
  const { vars, code } = args;
  if (vars == null) return;

  // ... each line for variables inside of function calls
  // assuming function calls are after the first open ( bracket
  const re = /\b([a-zA-Z_0-9]+)/g;
  // all detected variable names are collected in that array
  const varincode: string[] = [];
  code.forEach((block) => {
    block.split("\n").forEach((line) => {
      if (line.includes("(")) {
        line = line.slice(line.indexOf("("));
      }
      line.replace(re, (_, g) => {
        varincode.push(g);
        return ""; // ← to make TS happy
      });
    });
  });

  // then we add name = values lines to set only these
  // TODO syntax needs to be language specific!
  return Object.entries(vars)
    .filter(([k, _]) => varincode.includes(k))
    .map(([k, v]) => `${k} = ${v}`)
    .join("\n");
}

export function generate_setup_code(args: {
  code: string[];
  data: SnippetEntry;
}): string {
  const { code, data } = args;
  const { setup, variables: vars } = data;

  // given we have a "variables" dictionary, we check
  const extra = generate_setup_code_extra({ vars, code });

  let ret = "";
  if (setup) {
    ret += `${setup}`;
  }
  if (extra) {
    ret += `\n${extra}`;
  }
  return ret;
}
