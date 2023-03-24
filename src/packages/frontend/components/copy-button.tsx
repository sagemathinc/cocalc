import { CSSProperties, useState } from "react";
import { Button } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { CopyToClipboard } from "react-copy-to-clipboard";

interface Props {
  style?: CSSProperties;
  value?: string;
}

export default function CopyButton({ style, value }: Props) {
  const [copied, setCopied] = useState<boolean>(false);
  return (
    <CopyToClipboard text={value} onCopy={() => setCopied(true)}>
      <Button size="small" type="text" style={style}>
        <Icon name={copied ? "check" : "copy"} />
        {copied ? "Copied" : "Copy"}
      </Button>
    </CopyToClipboard>
  );
}
