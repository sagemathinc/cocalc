import { Button } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";

export default function Refresh({
  handleRefresh,
  disabled,
  style,
}: {
  handleRefresh;
  disabled?: boolean;
  style?;
}) {
  return (
    <Button
      type="text"
      onClick={handleRefresh}
      disabled={disabled}
      style={style}
    >
      <Icon name="refresh" />
      Refresh
    </Button>
  );
}
