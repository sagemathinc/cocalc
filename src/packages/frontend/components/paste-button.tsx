import { CSSProperties, useState } from "react";
import { Button } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { alert_message } from "@cocalc/frontend/alerts";

interface Props {
  style?: CSSProperties;
  paste: (text: string) => any;
  block?: true;
}

export default function PasteButton({ style, paste, block }: Props) {
  const [pasted, setPasted] = useState<boolean>(false);

  async function onClick() {
    try {
      const text = await navigator.clipboard.readText();
      paste(text);
      setPasted(true);
    } catch (err) {
      alert_message({
        type: "error",
        title: "Permission denied",
        message: `You have to enable clipboard access to make pasting from the clipboard work.\n${err}`,
      });
    }
  }

  return (
    <Button
      size="small"
      type="text"
      style={style}
      onClick={onClick}
      block={block}
    >
      <Icon name={pasted ? "check" : "paste"} />
      {pasted ? "Pasted" : "Paste"}
    </Button>
  );
}
