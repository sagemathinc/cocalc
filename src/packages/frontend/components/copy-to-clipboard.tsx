/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS } from "@cocalc/frontend/app-framework";
import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { Button, Input, Tooltip } from "antd";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  value: string;
  style?: CSSProperties;
  label?: ReactNode;
  labelStyle?: CSS;
  inputStyle?: CSS;
  size?: "large" | "middle" | "small";
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

export default function CopyToClipBoard(props: Props) {
  const { value, style, size, label, labelStyle, inputStyle } = props;

  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    setCopied(false);
  }, [value]);

  let copy = useMemo(() => {
    const btn = (
      <CopyToClipboard text={value} onCopy={() => setCopied(true)}>
        <Button
          size={size}
          style={{
            margin:
              "-2px -12px" /* hack so doesn't conflict w/ style of Input below*/,
          }}
        >
          <Icon name={copied ? "clipboard-check" : "clipboard"} />
        </Button>
      </CopyToClipboard>
    );
    if (!copied) return btn;
    return (
      <Tooltip title="Copied!" defaultVisible>
        {btn}
      </Tooltip>
    );
  }, [value, copied, size]);

  const input = (
    <Input
      size={size}
      readOnly
      onFocus={(e) => e.target.select()}
      value={value}
      addonAfter={copy}
    />
  );
  if (!label) return <div style={style}>{input}</div>;
  return (
    <div style={{ display: "flex", ...style }}>
      <div style={{ ...LABEL_STYLE, ...labelStyle }}>{label}</div>{" "}
      <div style={{ ...INPUT_STYLE, ...inputStyle }}>{input}</div>
    </div>
  );
}
