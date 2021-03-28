/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { Icon } from "smc-webapp/r_misc";
import { Editor } from "slate";
import { ListProperties, setListProperties } from "./list";
import { Button, /*Checkbox,*/ InputNumber } from "antd";

interface Props {
  listProperties: ListProperties | undefined;
  editor: Editor;
}

export const ListEdit: React.FC<Props> = ({ listProperties, editor }) => {
  if (listProperties == null) {
    return <></>;
  }
  const v: JSX.Element[] = [];

  /*
  v.push(
    <Checkbox key={"tight"} checked={listProperties.tight}>
      <span style={{ fontWeight: 350 }}> Tight</span>
    </Checkbox>
  );
  */

  v.push(
    <Button
      key="list-ul"
      size="small"
      style={{
        backgroundColor: listProperties.start == null ? "#ccc" : undefined,
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
      style={{
        backgroundColor: listProperties.start != null ? "#ccc" : undefined,
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
        size={"small"}
        style={{ flex: 1, maxWidth: "10ex" }}
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

  return <div style={{ flex: 1, display: "flex" }}>{v}</div>;
};
