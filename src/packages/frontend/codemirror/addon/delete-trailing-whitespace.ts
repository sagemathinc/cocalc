/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { defineExtension, Editor } from "codemirror";
import { delete_trailing_whitespace } from "@cocalc/util/misc";
import { ChangeObject } from "./types";

type OmittedLines = { [line: number]: boolean };

// Delete all trailing whitespace from the editor's buffer.
defineExtension(
  "delete_trailing_whitespace",
  function (opts: { omit_lines?: OmittedLines } = {}): void {
    // @ts-ignore -- I don't know how to type this...
    const cm: Editor = this;
    const omit_lines: OmittedLines = { ...(opts.omit_lines ?? {}) };
    // We *could* easily make a one-line version of this function that
    // just uses setValue.  However, that would mess up the undo
    // history (!), and potentially feel jumpy.
    let changeObj: ChangeObject | undefined = undefined;
    let currentObj: ChangeObject | undefined = undefined;
    const val = cm.getValue();
    const text1 = val.split("\n");
    const text2 = delete_trailing_whitespace(val).split("\n"); // a very fast regexp.
    if (text1.length !== text2.length) {
      // invariant: the number of lines cannot change!
      console.log(
        "Internal error -- there is a bug in delete_trailing_whitespace; please report."
      );
      return;
    }

    const selections =
      typeof (cm as any).listSelections === "function"
        ? (cm as any).listSelections()
        : [{ anchor: cm.getCursor(), head: cm.getCursor() }];
    for (const sel of selections) {
      const start = Math.min(sel.anchor.line, sel.head.line);
      const end = Math.max(sel.anchor.line, sel.head.line);
      for (let line = start; line <= end; line++) {
        omit_lines[line] = true;
      }
    }

    for (let i = 0; i < text1.length; i++) {
      if (omit_lines[i]) {
        continue;
      }
      if (text1[i].length !== text2[i].length) {
        const obj = {
          from: { line: i, ch: text2[i].length },
          to: { line: i, ch: text1[i].length },
          text: [""],
        };
        if (changeObj == null) {
          changeObj = obj;
          currentObj = changeObj;
        } else {
          if (currentObj != null) {
            currentObj.next = obj;
          }
          currentObj = obj;
        }
      }
    }
    if (changeObj != null) {
      cm.operation(() => {
        let cur: ChangeObject | undefined = changeObj;
        while (cur != null) {
          cm.replaceRange("", cur.from, cur.to);
          cur = cur.next;
        }
      });
    }
  }
);
