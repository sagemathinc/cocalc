import { Button, Popconfirm, Tooltip } from "antd";

export const SELECTED = "var(--cocalc-link, #337ab7)";

export function ResetButton({ onClick }) {
  return (
    <Tooltip title="Reset to defaults" mouseEnterDelay={0.9} placement="bottom">
      <Popconfirm
        title="Reset the presets to their default settings?"
        onConfirm={onClick}
      >
        <Button
          type="text"
          style={{
            color: "var(--cocalc-text-secondary, #666)",
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
