/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import React from "react";
import { Icon } from "@cocalc/frontend/components";
import { ReactEditor } from "../slate-react";
import { ListProperties, setListProperties } from "./list";
import { Button, Checkbox, InputNumber } from "antd";
import { indentListItem, unindentListItem } from "../format/indent";
import { moveListItemUp, moveListItemDown } from "../format/list-move";

interface Props {
  listProperties: ListProperties | undefined;
  editor: ReactEditor;
}

export const ListEdit: React.FC<Props> = ({ listProperties, editor }) => {
  if (listProperties == null) {
    return <></>;
  }
  const v: React.JSX.Element[] = [];

  v.push(
    <Checkbox
      key={"tight"}
      checked={listProperties.tight}
      onChange={(e) =>
        setListProperties(editor, {
          ...listProperties,
          tight: e.target.checked,
        })
      }
    >
      <span
        style={{ fontWeight: 400, color: "#666" }}
        title={"Uncheck for space between list items"}
      >
        {" "}
        Tight
      </span>
    </Checkbox>
  );

  v.push(
    <Button
      key="list-ul"
      size="small"
      title={"Convert to bulleted list"}
      style={{
        backgroundColor: listProperties.start == null ? "#ccc" : undefined,
        color: "#666",
      }}
      onClick={() => {
        if (listProperties.start == null) {
          // see https://github.com/sagemathinc/cocalc/issues/6451
          unindentListItem(editor);
        } else {
          setListProperties(editor, { ...listProperties, start: undefined });
        }
        ReactEditor.focus(editor);
      }}
    >
      <Icon name={"list-ul"} />
    </Button>
  );

  v.push(
    <Button
      key="list-ol"
      size="small"
      title={"Convert to numbered list"}
      style={{
        backgroundColor: listProperties.start != null ? "#ccc" : undefined,
        color: "#666",
      }}
      onClick={() => {
        if (listProperties.start == null) {
          setListProperties(editor, { ...listProperties, start: 1 });
        } else {
          // see https://github.com/sagemathinc/cocalc/issues/6451
          unindentListItem(editor);
        }
        ReactEditor.focus(editor);
      }}
    >
      <Icon name={"list-ol"} />
    </Button>
  );

  if (listProperties.start != null) {
    v.push(
      <InputNumber
        title={"Numbered list starting value"}
        size={"small"}
        style={{ flex: 1, maxWidth: "8ex" }}
        key={"start"}
        min={0}
        value={listProperties.start}
        onChange={(value) => {
          let start = typeof value == "string" ? parseInt(value) : value ?? 1;
          if (isNaN(start)) {
            start = 1;
          }
          listProperties.start = start;
          setListProperties(editor, {
            ...listProperties,
            start,
          });
          ReactEditor.focus(editor);
        }}
      />
    );
  }

  v.push(
    <Button
      key="move-up"
      size="small"
      title="Move list item up"
      style={{ color: "#666" }}
      onClick={() => {
        moveListItemUp(editor);
        ReactEditor.focus(editor, false, true);
      }}
    >
      <Icon name={"arrow-up"} />
    </Button>
  );

  v.push(
    <Button
      key="move-down"
      size="small"
      title="Move list item down"
      style={{ color: "#666" }}
      onClick={() => {
        moveListItemDown(editor);
        ReactEditor.focus(editor, false, true);
      }}
    >
      <Icon name={"arrow-down"} />
    </Button>
  );

  v.push(
    <Button
      key="indent"
      size="small"
      title="Indent list item (tab)"
      style={{ color: "#666" }}
      onClick={() => {
        indentListItem(editor);
        ReactEditor.focus(editor);
      }}
    >
      <Icon name={"indent"} />
    </Button>
  );

  v.push(
    <Button
      key="outdent"
      size="small"
      title="Inindent list item (shift+tab)"
      style={{ color: "#666" }}
      onClick={() => {
        unindentListItem(editor);
        ReactEditor.focus(editor);
      }}
    >
      <Icon name={"outdent"} />
    </Button>
  );

  return <div style={{ display: "flex" }}>{v}</div>;
};
