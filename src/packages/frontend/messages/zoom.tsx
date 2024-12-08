import { Icon } from "@cocalc/frontend/components/icon";
import { Button, Space } from "antd";
import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";

export default function Zoom({ style }: { style? }) {
  const actions = useActions("messages");
  const fontSize = useTypedRedux("messages", "fontSize");

  return (
    <Space.Compact style={style}>
      <Button
        type="text"
        onClick={() => {
          actions.setFontSize(fontSize - 1);
        }}
      >
        <Icon name="minus" />
      </Button>
      <Button
        type="text"
        onClick={() => {
          actions.setFontSize(fontSize + 1);
        }}
      >
        <Icon name="plus" />
      </Button>
    </Space.Compact>
  );
}
