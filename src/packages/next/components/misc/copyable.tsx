import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { Input, Tooltip } from "antd";
import { CopyToClipboard } from "react-copy-to-clipboard";
import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  text: string;
  label?: ReactNode;
  style?: CSSProperties;
  size?: "large" | "middle" | "small";
}

export default function Copyable({ text, style, size, label }: Props) {
  const [copied, setCopied] = useState<boolean>(false);
  useEffect(() => {
    setCopied(false);
  }, [text]);

  let copy = useMemo(() => {
    const btn = (
      <CopyToClipboard text={text} onCopy={() => setCopied(true)}>
        <Icon name={copied ? "clipboard-check" : "clipboard"} />
      </CopyToClipboard>
    );
    if (!copied) return btn;
    return (
      <Tooltip title="Copied!" defaultVisible>
        {btn}
      </Tooltip>
    );
  }, [text, copied]);

  const input = (
    <Input
      size={size}
      readOnly
      onFocus={(e) => e.target.select()}
      value={text}
      addonAfter={copy}
    />
  );
  if (!label) return <div style={style}>{input}</div>;
  return (
    <div style={{ display: "flex", ...style }}>
      <div
        style={{
          marginRight: "15px",
          display: "flex",
          justifyContent: "center",
          alignContent: "center",
          flexDirection: "column",
        }}
      >
        {label}
      </div>{" "}
      <div style={{ display: "inline-block", flex: 1 }}>{input}</div>
    </div>
  );
}
