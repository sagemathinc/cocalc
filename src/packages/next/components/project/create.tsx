/* Create a new project.
 */

import { useState } from "react";
import { Alert, Button, Divider, Input, Space } from "antd";
import Loading from "components/share/loading";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import apiPost from "lib/api/post";
import editURL from "lib/share/edit-url";

interface Props {
  label?: string;
  image?: string; // optional compute image
  defaultTitle?: string;
  start?: boolean; // start as soon as it is created.
  onCreate: (project: { project_id: string; title: string }) => void;
}

export default function CreateProject({
  label,
  image,
  defaultTitle,
  start,
  onCreate,
}: Props) {
  const [title, setTitle] = useState<string>(defaultTitle ?? "");
  const [project_id, setProjectID] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [state, setState] = useState<
    "config" | "creating" | "starting" | "created"
  >("config");

  async function create(title: string) {
    setError("");
    setState("creating");
    try {
      const response = await apiPost("/projects/create", { title, image });
      if (response.error) {
        throw Error(response.error);
      }
      if (start) {
        setState("starting");
        await apiPost("/projects/start", { project_id: response.project_id });
      }
      setProjectID(response.project_id);
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
            <Loading style={{ fontSize: "16pt" }}>
              Creating project "{title}"...
            </Loading>
          </div>
        )}
        {state == "starting" && (
          <div style={{ textAlign: "center" }}>
            <Loading style={{ fontSize: "16pt" }}>
              Starting project "{title}"...
            </Loading>
          </div>
        )}
        {state == "created" && (
          <div>
            <Icon
              name="check"
              style={{ color: "darkgreen", fontSize: "16pt" }}
            />{" "}
            Created project{" "}
            {project_id && title ? (
              <A
                href={editURL({
                  type: "collaborator",
                  project_id,
                })}
                external
              >
                {title}
              </A>
            ) : (
              ""
            )}
            .
          </div>
        )}
        <Input
          allowClear
          defaultValue={defaultTitle}
          disabled={state != "config"}
          placeholder="Project title (easily change this at any time)"
          onChange={(e) => setTitle(e.target.value)}
          onPressEnter={(e) => {
            e.preventDefault();
            create(title);
          }}
        />
        {state == "config" && (
          <Button
            disabled={!title || state != "config"}
            type={title ? "primary" : undefined}
            onClick={() => create(title)}
          >
            Create Project
          </Button>
        )}
      </Space>
    </div>
  );
}
