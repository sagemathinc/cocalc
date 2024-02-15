import { Checkbox, Tooltip } from "antd";

interface Props {
  advanced: boolean;
  setAdvanced: (advanced: boolean) => void;
  title;
  style?;
}

export default function Advanced({
  advanced,
  setAdvanced,
  title,
  style,
}: Props) {
  return (
    <Tooltip title={title}>
      <Checkbox
        checked={advanced}
        onChange={(e) => setAdvanced(e.target.checked)}
        style={style}
      >
        Advanced
      </Checkbox>
    </Tooltip>
  );
}
