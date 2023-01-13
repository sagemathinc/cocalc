/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Space, Typography } from "antd";
import jsonic from "jsonic";
import React, { useState } from "react";

import { CSS } from "@cocalc/frontend/app-framework";
import { COLORS } from "@cocalc/util/theme";

const { Text } = Typography;

// this is a simple json editor, basically a textarea that processes its content using jsonic

interface Props {
  value: string;
  rows?: number;
  onSave: (value: string) => void;
}

export const JsonEditor: React.FC<Props> = (props: Props) => {
  const { value, onSave, rows = 3 } = props;
  const [error, setError] = useState<string>("");
  const [focused, setFocused] = useState<boolean>(false);
  const [editing, setEditing] = useState<string>(value);

  function doCommit(save: boolean) {
    try {
      const val = jsonic(editing); // might throw error
      const oneLine = JSON.stringify(val);
      setEditing(oneLine); // one-line string
      setFocused(false);
      setError("");
      if (save) onSave(oneLine);
    } catch (err) {
      setError(err.message);
    }
  }

  function setFormatted() {
    try {
      setEditing(JSON.stringify(jsonic(editing), null, 2));
    } catch (err) {
      setError(err.message);
    }
  }

  function onChange(next: string) {
    setEditing(next);
  }

  function renderError(): JSX.Element | null {
    if (!error) return null;
    return <div style={{ color: "red" }}>{error}</div>;
  }

  function doCancel() {
    setEditing(value); // that's the original value when the component was instantiated
    setError("");
    setFocused(false);
  }

  function onFocus() {
    setFormatted();
    setFocused(true);
  }

  const style: CSS = {
    ...(!focused && { color: COLORS.GRAY, cursor: "pointer" }),
    width: "100%",
  };

  return (
    <div>
      <div>
        <textarea
          spellCheck="false"
          onFocus={onFocus}
          style={style}
          rows={focused ? rows : 1}
          value={editing}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      </div>
      {renderError()}
      <Space>
        <Button
          size="small"
          type={focused ? "primary" : undefined}
          disabled={!focused}
          onClick={() => doCommit(true)}
        >
          Commit
        </Button>
        <Button size="small" disabled={!focused} onClick={doCancel}>
          Cancel
        </Button>
        {value != editing && (
          <Text type="danger">
            Use "Save" (at the top or bottom) to actually save changes.
          </Text>
        )}
      </Space>
    </div>
  );
};
