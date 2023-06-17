import { Card } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import Information from "./information";

export default function QuotaEditor({ project_id, style }) {
  return (
    <Card
      title={
        <>
          <Icon name="compass" /> Quota Editor (pay as you go)
        </>
      }
      type="inner"
      style={style}
      extra={<Information />}
    >
      {project_id}
    </Card>
  );
}
