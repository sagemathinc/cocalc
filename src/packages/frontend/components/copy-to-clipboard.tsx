/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CopyOutlined } from "@ant-design/icons";
import { Button, Input, Space, Tooltip } from "antd";
import { ReactNode, useEffect, useMemo, useState } from "react";
import { CopyToClipboard } from "react-copy-to-clipboard";

import { CSS } from "@cocalc/frontend/app-framework";

interface Props {
  value: string;
  style?: CSS;
  label?: ReactNode;
  labelStyle?: CSS;
  inputStyle?: CSS;
  inputWidth?: string;
  size?: "large" | "middle" | "small";
  before?: boolean;
}

const INPUT_STYLE: CSS = { display: "inline-block", flex: 1 } as const;

const LABEL_STYLE: CSS = {
  marginRight: "15px",
  display: "flex",
  flex: "0 0 auto",
  justifyContent: "center",
  alignContent: "center",
  flexDirection: "column",
} as const;

export default function CopyToClipBoard({
  value,
  style,
  size,
  label,
  labelStyle,
  inputStyle,
  inputWidth,
  before,
}: Props) {
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    setCopied(false);
  }, [value]);

  let copy = useMemo(() => {
    const btn = (
      <CopyToClipboard text={value} onCopy={() => setCopied(true)}>
        <Button size={size} icon={<CopyOutlined />} />
      </CopyToClipboard>
    );
    if (!copied) return btn;
    return (
      <Tooltip title="Copied!" defaultOpen>
        {btn}
      </Tooltip>
    );
  }, [value, copied, size]);

  // ws: See https://ant.design/components/input for why using Input.Group is the
  // right way to do this.
  // hsy: Input.Group is deprecated, using Space.Compact instead
  const input = (
    <Space.Compact>
      {before ? copy : undefined}
      <Input
        style={{
          width: inputWidth ?? `${value.length + 8}ex`,
          fontFamily: "monospace",
        }}
        readOnly
        size={size}
        value={value}
        onFocus={(e) => e.target.select()}
      />
      {!before ? copy : undefined}
    </Space.Compact>
  );
  if (!label) return <div style={style}>{input}</div>;
  return (
    <div style={{ display: "flex", ...style }}>
      <div style={{ ...LABEL_STYLE, ...labelStyle }}>{label}</div>{" "}
      <div style={{ ...INPUT_STYLE, ...inputStyle }}>{input}</div>
    </div>
  );
}
