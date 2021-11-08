/* Create a new project.
 */

import { useState } from "react";
import { Alert, Button, Divider, Input, Space } from "antd";
import Loading from "components/share/loading";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import apiPost from "lib/api/post";

interface Props {
  label?: string;
  image?: string; // optional compute image
  onCreate: (project: { project_id: string; title: string }) => void;
}

export default function CreateProject({ label, image, onCreate }: Props) {
  const [title, setTitle] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [state, setState] = useState<"config" | "creating" | "created">(
    "config"
  );

  async function create(title: string) {
    setError("");
    setState("creating");
    try {
      const response = await apiPost("/projects/create", { title, image });
      if (response.error) {
        throw Error(response.error);
      }
      setState("created");
      onCreate({ project_id: response.project_id, title });
    } catch (err) {
      setState("config");
      setError(`${err}`);
    }
  }

  return (
    <div>
      <Divider style={{ color: "#666" }}>{label ?? "Create a Project"}</Divider>
      <Space direction="vertical" style={{ width: "100%" }}>
        {error && <Alert type="error" message={error} showIcon />}
        {state == "creating" && (
          <div style={{ textAlign: "center" }}>
            <Loading style={{ fontSize: "16pt" }}>Creating {title}...</Loading>
          </div>
        )}
        {state == "created" && (
          <div>
            <Icon
              name="check"
              style={{ color: "darkgreen", fontSize: "16pt" }}
            />{" "}
            Successfully created your project <A>{title}</A>
          </div>
        )}
        <Input
          disabled={state != "config"}
          placeholder="Project title (easily change this at any time)"
          onChange={(e) => setTitle(e.target.value)}
          onPressEnter={(e) => {
            e.preventDefault();
            create(title);
          }}
        />
        <Button
          disabled={!title || state != "config"}
          type={title ? "primary" : undefined}
          onClick={() => create(title)}
        >
          Create Project
        </Button>
      </Space>
    </div>
  );
}
