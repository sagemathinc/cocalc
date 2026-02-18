import { Button } from "antd";
import { CSSProperties, useEffect, useState } from "react";
import { CopyToClipboard } from "react-copy-to-clipboard";

import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  style?: CSSProperties;
  value?: string;
  size?;
  noText?: boolean;
  block?: true;
}

export default function CopyButton({
  style,
  value,
  size,
  noText = false,
  block,
}: Props) {
  const [copied, setCopied] = useState<boolean>(false);
  useEffect(() => {
    setCopied(false);
  }, [value]);
  return (
    <CopyToClipboard text={value} onCopy={() => setCopied(true)}>
      <Button
        block={block}
        size={size}
        type="text"
        style={style}
        onClick={(e) => e.stopPropagation()}
        aria-label={copied ? "Copied" : "Copy to clipboard"}
        aria-live="polite"
      >
        <Icon name={copied ? "check" : "copy"} />
        {noText ? undefined : copied ? "Copied" : "Copy"}
      </Button>
    </CopyToClipboard>
  );
}
