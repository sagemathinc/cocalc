/*
The pen panel.
*/

import { Button, Tooltip } from "antd";
import { PANEL_STYLE } from "./panel";
import { Icon } from "@cocalc/frontend/components/icon";

const maxRadius = 15;

export default function Pen() {
  return (
    <div
      style={{
        ...PANEL_STYLE,
        display: "flex",
        flexDirection: "column",
        left: "55px",
        width: "46px",
        paddingBottom: "10px",
      }}
    >
      <Tooltip title="Pen">
        <Button type="text">
          <Icon style={{ color: "blue" }} name="pencil" />
        </Button>
      </Tooltip>
      <Tooltip title="Highlighter">
        <Button type="text">
          <Icon name="blog" />
        </Button>
      </Tooltip>

      <Button style={{ paddingLeft: "7px" }} type="text">
        <BrushPreview radius={1} color="black" borderColor="blue" />
      </Button>
      <Button style={{ paddingLeft: "7px" }} type="text">
        <BrushPreview radius={5} color="green" />
      </Button>
      <Button style={{ paddingLeft: "7px" }} type="text">
        <BrushPreview radius={10} color="red" />
      </Button>
    </div>
  );
}

function BrushPreview({
  radius,
  color,
  borderColor,
}: {
  radius: number;
  color: string;
  borderColor?: string;
}) {
  return (
    <div
      style={{
        width: `${maxRadius * 2}px`,
        height: `${maxRadius * 2}px`,
        borderRadius: `${maxRadius}px`,
        background: "white",
        border: `1px solid ${borderColor ?? "#ccc"}`,
        paddingLeft: `${maxRadius - radius - 1}px`,
        paddingTop: `${maxRadius - radius - 1}px`,
      }}
    >
      <div
        style={{
          width: `${radius * 2}px`,
          height: `${radius * 2}px`,
          borderRadius: `${radius}px`,
          background: color,
        }}
      ></div>
    </div>
  );
}
