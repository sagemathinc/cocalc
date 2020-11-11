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
