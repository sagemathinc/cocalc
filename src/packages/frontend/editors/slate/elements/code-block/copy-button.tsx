import { useState } from "react";
import { Button, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { CopyToClipboard } from "react-copy-to-clipboard";

export default function CopyButton({ value }) {
  const [copied, setCopied] = useState<boolean>(false);
  return (
    <div style={{ float: "right", position: "relative" }}>
      <CopyToClipboard text={value} onCopy={() => setCopied(true)}>
        <Tooltip title="Copy this code to your clipboard" placement="left">
          <Button
            size="small"
            type="text"
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              zIndex: 1,
              color: "#666",
              fontSize: "11px",
            }}
          >
            <Icon name={copied ? "check" : "copy"} />
          </Button>
        </Tooltip>
      </CopyToClipboard>
    </div>
  );
}
