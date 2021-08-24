/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { delay } from "awaiting";
import { Button } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { ReactEditor } from "../slate-react";
import { selectNextMatch, selectPreviousMatch } from "./find-matches";

interface Props {
  decorate;
  editor: ReactEditor;
  disabled: boolean;
}

export const SearchControlButtons: React.FC<Props> = ({
  decorate,
  editor,
  disabled,
}) => {
  return (
    <div style={{ height: "23px" }}>
      <Button
        shape="round"
        type="text"
        size="small"
        disabled={disabled}
        style={{ padding: "0 5px" }}
        onClick={() => previousMatch(editor, decorate)}
      >
        <Icon name="chevron-up" />
      </Button>{" "}
      <Button
        shape="round"
        size="small"
        type="text"
        disabled={disabled}
        style={{ padding: "0 5px" }}
        onClick={() => nextMatch(editor, decorate)}
      >
        <Icon name="chevron-down" />
      </Button>
    </div>
  );
};

export async function nextMatch(editor, decorate) {
  const focused = ReactEditor.isFocused(editor);
  if (!focused) {
    ReactEditor.focus(editor);
    await delay(0);
  }
  selectNextMatch(editor, decorate);
  editor.scrollCaretIntoView();
  await delay(100);
  editor.scrollCaretIntoView();
}

export async function previousMatch(editor, decorate) {
  const focused = ReactEditor.isFocused(editor);
  if (!focused) {
    ReactEditor.focus(editor);
    await delay(0);
  }
  selectPreviousMatch(editor, decorate);
  editor.scrollCaretIntoView();
  await delay(100);
  editor.scrollCaretIntoView();
}
