import { CSSProperties, useEffect, useState } from "react";
import { Button } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { CopyToClipboard } from "react-copy-to-clipboard";

interface Props {
  style?: CSSProperties;
  value?: string;
  size?;
}

export default function CopyButton({ style, value, size }: Props) {
  const [copied, setCopied] = useState<boolean>(false);
  useEffect(() => {
    setCopied(false);
  }, [value]);
  return (
    <CopyToClipboard text={value} onCopy={() => setCopied(true)}>
      <Button size={size} type="text" style={style}>
        <Icon name={copied ? "check" : "copy"} />
        {copied ? "Copied" : "Copy"}
      </Button>
    </CopyToClipboard>
  );
}
