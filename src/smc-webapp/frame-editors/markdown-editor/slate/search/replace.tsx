/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Input, Popconfirm } from "antd";
import * as React from "react";
const { useRef, useState } = React;
import { replaceAll, replaceOne } from "./replace-matches";
import { ReactEditor } from "../slate-react";

interface Props {
  editor: ReactEditor;
  decorate;
  search: string;
  cancel: () => void;
}

export const Replace: React.FC<Props> = ({ cancel, editor, search, decorate }) => {
  const [replace, setReplace] = useState<string>("");
  const inputRef = useRef<any>(null);
  return (
    <div style={{ display: "flex" }}>
      <Input
        ref={inputRef}
        placeholder="Replace..."
        value={replace}
        onChange={(e) => setReplace(e.target.value)}
        allowClear={true}
        size="small"
        style={{ border: 0, flex: 1 }}
        onKeyDown={async (event) => {
          if (event.key == "Escape") {
            event.preventDefault();
            cancel();
            return;
          }
        }}
      />
      {replace.trim() && (
        <>
          <Button
            size="small"
            onClick={() => replaceOne(editor, decorate, replace)}
          >
            One
          </Button>{" "}
          <Popconfirm
            title={`Replace all instances of '${search}' by '${replace}' across the entire document?`}
            onConfirm={() => replaceAll(editor, decorate, replace)}
            okText={"Yes, replace all"}
            cancelText={"Cancel"}
          >
            <Button size="small">All</Button>
          </Popconfirm>
        </>
      )}
    </div>
  );
};
