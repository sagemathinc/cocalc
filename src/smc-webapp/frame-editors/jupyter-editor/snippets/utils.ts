/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { pick, merge } from "lodash";
import { basename } from "path";
import { unreachable, separate_file_extension } from "smc-util/misc";
import { reuseInFlight } from "async-await-utils/hof";
import { exec } from "../../generic/client";
import { canonical_language } from "../../../jupyter/store";
import {
  Snippets,
  LangSnippets,
  SnippetEntry,
  SnippetDoc,
  JupyterNotebook,
  Error,
} from "./types";

// snippets are specific to a project, even if data comes from a global directory
const custom_snippets_cache: {
  [project_id: string]: LangSnippets;
} = {};

export const CUSTOM_SNIPPETS_TITLE = "Custom Snippets";
export const LOCAL_CUSTOM_DIR = "code-snippets";
export const GLOBAL_CUSTOM_DIR = "$COCALC_CODE_SNIPPETS_DIR";

// we combine alternating runs of markdown cells and code cells as a single snippet
// it starts by defining an empty "md" string and no code, and then either collects more text
// or starts to collect code. the moment it tries to collect more text, a snippet is emitted
// and the text part reset to the current text.
// there is a bit of extra-trickery for titles. a h1 title should be used as the overall title
// while smaller h2/h3 titles for the individual snippet titles.
// besides that, what to do if there is no markdown or many code cells? not clear.
function cells2snippets(cells?: JupyterNotebook["cells"]): SnippetEntry {
  const entries: SnippetDoc[] = [];
  const ret: SnippetEntry = { entries };
  if (!cells) return ret;
  let md: string | null = "";
  let code: string[] = [];
  let title: string | null = null;
  let i = 1;

  // special case: if there is no markdown, each cell is a snippet
  const no_markdown =
    cells
      .filter((c) => c.cell_type === "markdown")
      .filter((c) => (c.source ?? []).join("").trim().length > 0).length === 0;

  // ends a run of one or more codecells
  function finish() {
    const fallback = `Snippet ${i}`;
    const descr = md ?? fallback;
    // check if there is at least any text/code to snippet
    // to avoid empty cells at the bottom
    if (
      (md ?? "").trim().length > 0 ||
      code.filter((c) => c.trim().length > 0).length > 0
    ) {
      entries.push([title ?? fallback, [code, descr]]);
      i += 1;
    }
    md = title = null;
    code = [];
  }

  for (const cell of cells) {
    const ct = cell.cell_type;
    if (!ct) continue;
    switch (ct) {
      case "markdown":
        if (code.length > 0) finish();
        if (title == null) {
          // lvl2_title might modify cell.source!
          title = lvl2_title(cell.source ?? []);
        }
        md = `${md ?? ""}\n\n${(cell.source ?? []).join("").trim()}`;
        break;
      case "code":
        const cs = (cell.source ?? []).join("").trim();
        if (cs.trim()) code.push(cs);
        if (no_markdown) finish();
        break;
    }
  }
  if (code.length > 0) finish();

  return ret;
}

// search for a markdown title starting with at least ##...
// this also removes the title it finds!
function lvl2_title(lines: string[]): string | null {
  for (const i in lines) {
    // weird, sometimes lines end with \n which aren't matched with the regex
    const line = lines[i].split("\n")[0];
    const m = line.match(/^#[#]+[\s]+(.*)$/);
    if (m?.[1] != null) {
      lines[i] = "";
      return m[1].trim();
    }
  }
  return null;
}

// the level 1 title is either the first h1 title in the first cell, or the filename
// this also removes the title it finds!
function lvl1_title(fn: string, nb: JupyterNotebook) {
  const cell1 = nb.cells?.[0];
  if (cell1 != null) {
    if (cell1.cell_type === "markdown" && cell1.source) {
      for (const i in cell1.source) {
        const line = cell1.source[i];
        const m = line.match(/^#[\s]+(.*)$/);
        if (m?.[1] != null) {
          // we get rid of the title – and here we know this exists, TS can't
          // @ts-ignore
          nb.cells[0].source[i] = "";
          return m[1].trim();
        }
      }
    }
  }
  // fallback
  const { name } = separate_file_extension(fn);
  return name;
}

function parse_custom_snippets(json?: object): LangSnippets {
  const ret = {};
  if (json == null) return ret;

  for (const entry of Object.entries(json)) {
    const [fn, nb]: [string, JupyterNotebook] = entry;
    const fn_base = basename(fn);
    const lvl1 = lvl1_title(fn_base, nb);
    const meta = nb.metadata;
    // python as a default fallback is a sane choice
    const lang =
      canonical_language(meta?.kernelspec?.name, meta?.language_info?.name) ??
      "python";
    const sippets = cells2snippets(nb.cells);
    if (ret[lang] == null) {
      ret[lang] = { [CUSTOM_SNIPPETS_TITLE]: {} };
    }
    if (ret[lang][CUSTOM_SNIPPETS_TITLE][lvl1] == null) {
      ret[lang][CUSTOM_SNIPPETS_TITLE][lvl1] = sippets;
    } else {
      ret[lang][CUSTOM_SNIPPETS_TITLE][lvl1] = merge(
        ret[lang][CUSTOM_SNIPPETS_TITLE][lvl1],
        sippets
      );
    }
  }
  return ret;
}

async function fetch_custom_sippets_data(
  location: "local" | "global",
  project_id: string
): Promise<LangSnippets | Error> {
  // we collect all files by their name and drop all outputs (images are embedded!)
  // TODO of course, if there are many files, we'll end up having problems.
  const base = (function () {
    const local = `$HOME/${LOCAL_CUSTOM_DIR}`;
    switch (location) {
      case "local":
        return local;
      case "global":
        return GLOBAL_CUSTOM_DIR;
      default:
        unreachable(location);
        return local;
    }
  })();
  // TODO make this robust for spaces in filenames
  const command = `jq -cnM 'reduce inputs as $s (.; .[input_filename] += $s)' ${base}/*.ipynb | jq -Mrc 'del(.. | .outputs?)'`;
  const res = await exec({
    command,
    project_id,
    bash: true,
    err_on_exit: false,
  });

  if (res.exit_code === 0) {
    try {
      return parse_custom_snippets(JSON.parse(res.stdout));
    } catch (err) {
      return { error: `${err}` };
    }
  } else {
    return { error: res.stderr };
  }
}

async function _load_custom_snippets(
  project_id: string,
  set_error: (err) => void,
  forced: boolean
): Promise<LangSnippets> {
  const cached = custom_snippets_cache[project_id];
  if (forced) {
    delete custom_snippets_cache[project_id];
  } else if (cached != null) {
    return cached;
  }
  const [local, global] = await Promise.all([
    fetch_custom_sippets_data("local", project_id),
    fetch_custom_sippets_data("global", project_id),
  ]);
  const snippets: LangSnippets = {};
  if (local?.error != null) {
    set_error(`Error loading local snippets: ${local.error}`);
  } else {
    merge(snippets, local);
  }
  if (global?.error != null) {
    set_error(`Error loading local snippets: ${global.error}`);
  } else {
    merge(snippets, global);
  }
  custom_snippets_cache[project_id] = snippets;
  return snippets;
}

export const load_custom_snippets = reuseInFlight(_load_custom_snippets);

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
