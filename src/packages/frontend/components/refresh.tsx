import { Button } from "antd";
import { Icon } from "./icon";
import { CSSProperties } from "react";

interface Props {
  refresh: () => void;
  style?: CSSProperties;
}

export default function Refresh({ refresh, style }: Props) {
  return (
    <Button onClick={refresh} style={style}>
      <Icon name="refresh" /> Refresh
    </Button>
  );
}
