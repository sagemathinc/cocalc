import { Button } from "antd";
import { formatAction } from "../format";
import { Icon } from "@cocalc/frontend/components/icon";

export default function LinkButton({ editor }) {
  return (
    <Button
      size="small"
      onClick={() => {
        formatAction(editor, "link", []);
      }}
    >
      <Icon name="link"/>
    </Button>
  );
}
