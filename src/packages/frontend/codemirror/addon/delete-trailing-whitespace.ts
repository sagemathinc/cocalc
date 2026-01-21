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
    if (opts.omit_lines == null) {
      opts.omit_lines = {};
    }
    // We *could* easily make a one-line version of this function that
    // just uses setValue.  However, that would mess up the undo
    // history (!), and potentially feel jumpy.
    let changeObj: ChangeObject | undefined = undefined;
    let currentObj: ChangeObject | undefined = undefined;
    const val = cm.getValue();
    const text1 = val.split("\n");
    const text2 = delete_trailing_whitespace(val).split("\n"); // a very fast regexp.
    const pos = cm.getCursor();
    if (text1.length !== text2.length) {
      // invariant: the number of lines cannot change!
      console.log(
        "Internal error -- there is a bug in delete_trailing_whitespace; please report."
      );
      return;
    }
    opts.omit_lines[pos.line] = true;
    for (let i = 0; i < text1.length; i++) {
      if (opts.omit_lines[i]) {
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
      (cm as any).apply_changeObj?.(changeObj);
    }
  }
);
