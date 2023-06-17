import { Card } from "antd";

export default function QuotaEditor({ project_id, style }) {
  return (
    <Card title={"Quota Editor"} type="inner" style={style}>
      {project_id}
    </Card>
  );
}
