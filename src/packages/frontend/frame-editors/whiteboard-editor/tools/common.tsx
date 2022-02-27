import { Button, Popconfirm, Tooltip } from "antd";

export const SELECTED = "#337ab7";

export function ResetButton({ onClick }) {
  return (
    <Tooltip title="Reset to defaults">
      <Popconfirm
        title="Reset the presets to their default settings?"
        onConfirm={onClick}
      >
        <Button
          type="text"
          style={{
            color: "#666",
            margin: "auto",
            padding: 0,
            fontSize: "12px",
          }}
        >
          Reset
        </Button>
      </Popconfirm>
    </Tooltip>
  );
}
