import { Card } from "antd";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { ComputeServerUserInfo } from "@cocalc/util/db-schema/compute-servers";
import { CSSProperties } from "react";

interface Props extends ComputeServerUserInfo {
  style?: CSSProperties;
}

export default function ComputeServer({
  id,
  name,
  color,
  state,
  cloud,
  configuration,
  project_id,
  style,
}: Props) {
  return (
    <Card
      title={name ?? "Unnamed Compute Server"}
      extra={<>Id: {id}</>}
      style={{
        width: "100%",
        border: `2px solid ${color ?? "#aaa"}`,
        ...style,
      }}
    >
      <div>State: {state}</div>
      <div>Cloud: {cloud}</div>
      <div>
        Configuration: <pre>{JSON.stringify(configuration, undefined, 2)}</pre>
      </div>
      <div>
        <ProjectTitle project_id={project_id} />
      </div>
    </Card>
  );
}
