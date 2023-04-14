import { Button, Tooltip } from "antd";
import { formatAction } from "../format";
import { Icon } from "@cocalc/frontend/components/icon";

export default function LinkButton({ editor }) {
  return (
    <Tooltip title="Create a link from the selected text, or insert a new link.">
      <Button
        size="small"
        onClick={() => {
          formatAction(editor, "link", []);
        }}
      >
        <Icon name="link" />
      </Button>
    </Tooltip>
  );
}
