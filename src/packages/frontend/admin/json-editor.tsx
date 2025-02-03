/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Space, Typography } from "antd";
import jsonic from "jsonic";
import React, { useState } from "react";
import { useIntl } from "react-intl";

import { CSS } from "@cocalc/frontend/app-framework";
import { labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";

const { Paragraph } = Typography;

// this is a simple json editor, basically a textarea that processes its content using jsonic

interface Props {
  value: string;
  rows?: number;
  onSave: (value: string) => void;
  savePosition?: "top-bottom" | "top";
  readonly?: boolean;
}

export const JsonEditor: React.FC<Props> = (props: Props) => {
  const intl = useIntl();
  const { value, onSave, rows = 3, readonly = false } = props;
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
      setError(`${err}`);
    }
  }

  function setFormatted() {
    try {
      setEditing(JSON.stringify(jsonic(editing), null, 2));
    } catch (err) {
      setError(`${err}`);
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
    if (readonly) return;
    setFormatted();
    setFocused(true);
  }

  const style: CSS = {
    ...(!focused && { color: COLORS.GRAY, cursor: "pointer" }),
    width: "100%",
  };

  function renderMain(): JSX.Element {
    if (focused) {
      return (
        <textarea
          spellCheck="false"
          onFocus={onFocus}
          style={style}
          rows={rows}
          value={editing}
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      );
    } else {
      return (
        <Paragraph
          onClick={onFocus}
          type={readonly ? "secondary" : undefined}
          style={{
            ...(readonly ? {} : { cursor: "pointer" }),
            fontFamily: "monospace",
            fontSize: "90%",
          }}
        >
          {editing}
        </Paragraph>
      );
    }
  }

  function renderButtons() {
    if (readonly) return;
    return (
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
          {intl.formatMessage(labels.cancel)}
        </Button>
      </Space>
    );
  }

  return (
    <div>
      <div>{renderMain()}</div>
      {renderError()}
      {renderButtons()}
    </div>
  );
};
