/* Create a new project.
 */

import { useState } from "react";
import { Alert, Button, Divider, Input, Space } from "antd";

interface Props {
  label?: string;
  onCreate: (project_id: string) => void;
}

export default function CreateProject({ label, onCreate }: Props) {
  const [title, setTitle] = useState<string>("");
  return (
    <div>
      <Divider style={{ color: "#666" }}>{label ?? "Create a Project"}</Divider>
      <Space direction="vertical"  style={{ width: "100%" }}>
        <Input
          placeholder="Project title (you can change this later)"
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button disabled={!title}>Create Project</Button>
      </Space>
    </div>
  );
}
