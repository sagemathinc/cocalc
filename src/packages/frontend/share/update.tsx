import { Button } from "antd";

interface Props {
  project_id: string;
  path: string;
  last_edited?: Date;
  style?: React.CSSProperties; // Declare style prop
}

export default function UpdatePublishedFiles({
  project_id,
  path,
  last_edited,
  style,
}: Props) {
  console.log({ last_edited, now: new Date() });
  return (
    <Button
      disabled={
        last_edited == null || last_edited.valueOf() >= Date.now() - 15000
      }
      type="primary"
      style={style}
    >
      Update Published Files
    </Button>
  );
}
