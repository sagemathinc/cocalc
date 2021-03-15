/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { IS_ANDROID, IS_FIREFOX } from "smc-webapp/feature";
import * as React from "react";
import { Button } from "antd";
import { Icon } from "smc-webapp/r_misc";
import { formatAction } from "./format";
import { SlateEditor } from "./editable-markdown";

const WARNING_STYLE = { padding: "5px", color: "white", background: "darkred" };

export interface Marks {
  [mark: string]: boolean | undefined;
}

interface Props {
  Search: JSX.Element;
  isCurrent?: boolean;
  marks: Marks;
  editor: SlateEditor;
}

const HEIGHT = "25px";

export const EditBar: React.FC<Props> = ({
  isCurrent,
  Search,
  marks,
  editor,
}) => {
  // console.log("EditBar", JSON.stringify(marks));
  function renderButtons() {
    const v: JSX.Element[] = [];
    for (const mark of [
      "bold",
      "italic",
      "underline",
      "strikethrough",
      "code",
      /*"sup",
      "sub",*/
    ]) {
      v.push(
        <MarkButton
          key={mark}
          mark={mark}
          active={marks[mark] ?? false}
          editor={editor}
        />
      );
    }
    return <div>{v}</div>;
  }

  function renderSearch() {
    // put first since float right.
    return <div style={{ float: "right" }}>{Search}</div>;
  }

  function renderAndroidWarning() {
    return (
      <span style={WARNING_STYLE}>Android markdown editing NOT supported</span>
    );
  }

  function renderFirefoxWarning() {
    return (
      <span style={WARNING_STYLE}>
        Firefox markdown editor NOT fully supported
      </span>
    );
  }

  function renderBody() {
    return (
      <>
        {renderSearch()}
        {IS_ANDROID && renderAndroidWarning()}
        {IS_FIREFOX && renderFirefoxWarning()}
        {!IS_ANDROID && !IS_FIREFOX && renderButtons()}
      </>
    );
  }

  return (
    <div style={{ borderBottom: "1px solid lightgray", height: HEIGHT }}>
      {isCurrent && renderBody()}
    </div>
  );
};

interface MarkButtonProps {
  mark: string;
  active: boolean;
  editor: SlateEditor;
}

const MarkButton: React.FC<MarkButtonProps> = ({ mark, active, editor }) => {
  return (
    <Button
      type="text"
      style={{
        color: "#666",
        backgroundColor: active ? "#ccc" : undefined,
        height: "26px",
        paddingTop: 0,
      }}
      onClick={() => formatAction(editor, mark, [])}
    >
      <Icon name={mark} />
    </Button>
  );
};
