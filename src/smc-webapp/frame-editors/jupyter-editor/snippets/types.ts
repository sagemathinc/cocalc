/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// this defines the datastructure we want to present to the user

export type SnippetDoc = [
  title: string,
  snippet: [code: string | string[], descr: string]
];

export type Vars = { [name: string]: string };

export interface SnippetEntry {
  entries: SnippetDoc[];
  sortweight?: number;
  setup?: "string";
  variables?: Vars;
}

export type SnippetEntries = {
  [key: string]: SnippetEntry;
};

export type Snippets = {
  [key: string]: SnippetEntries;
};

export type LangSnippets = { [lang: string]: Snippets };

// a minimal/incomplete jupyter notebook, just enough for our purposes and all fields are optional ... don't use it elsewhere
export interface JupyterNotebook {
  cells?: {
    cell_type?: "markdown" | "code";
    source?: string[];
  }[];
  metadata?: {
    kernelspec?: {
      display_name?: string;
      language?: string; // "python", ...
      name?: string; // "python3", ...
    };
    language_info?: {
      name?: string; // "python"
    };
  };
}
