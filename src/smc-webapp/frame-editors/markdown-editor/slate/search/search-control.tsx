/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Button } from "antd";
import { Icon } from "smc-webapp/r_misc";
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
    <div style={{ margin: "-1.5px -10px 0 -5px", height: "23px" }}>
      <Button
        shape="round"
        size="small"
        disabled={disabled}
        onClick={() => previousMatch(editor, decorate)}
      >
        <Icon name="chevron-up" />
      </Button>{" "}
      <Button
        shape="round"
        size="small"
        disabled={disabled}
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
  if (!focused) {
    await delay(10);
  }
  editor.scrollCaretIntoView();
}

export async function previousMatch(editor, decorate) {
  const focused = ReactEditor.isFocused(editor);
  if (!focused) {
    ReactEditor.focus(editor);
    await delay(0);
  }
  selectPreviousMatch(editor, decorate);
  if (!focused) {
    await delay(10);
  }
  editor.scrollCaretIntoView();
}
