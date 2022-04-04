/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import React from "react";
import { Icon } from "@cocalc/frontend/components";
import { ReactEditor } from "../slate-react";
import { ListProperties, setListProperties } from "./list";
import { Button, Checkbox, InputNumber } from "antd";
import { indentListItem, unindentListItem } from "../format/indent";

interface Props {
  listProperties: ListProperties | undefined;
  editor: ReactEditor;
}

export const ListEdit: React.FC<Props> = ({ listProperties, editor }) => {
  if (listProperties == null) {
    return <></>;
  }
  const v: JSX.Element[] = [];

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
        setListProperties(editor, { ...listProperties, start: undefined });
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
        }
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
        }}
      />
    );
  }

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

  return <div style={{ flex: 1, display: "flex" }}>{v}</div>;
};
