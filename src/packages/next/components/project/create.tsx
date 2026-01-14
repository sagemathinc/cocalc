/* Create a new project.
 */

import { useState } from "react";
import { Alert, Button, Divider, Input, Space } from "antd";
import Loading from "components/share/loading";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import apiPost from "lib/api/post";
import editURL from "lib/share/edit-url";
import { WORKSPACE_LABEL } from "@cocalc/util/i18n/terminology";

interface Props {
  label?: string;
  image?: string; // optional compute image
  defaultTitle?: string;
  start?: boolean; // start as soon as it is created.
  onCreate: (project: { project_id: string; title: string }) => void;
  public_path_id?: string; // if given, project is being created in order to use this public path.
}

export default function CreateProject({
  label,
  image,
  defaultTitle,
  start,
  onCreate,
  public_path_id,
}: Props) {
  const workspaceLabel = WORKSPACE_LABEL;
  const workspaceLabelLower = WORKSPACE_LABEL.toLowerCase();
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
      const response = await apiPost("/projects/create", {
        title,
        image,
        public_path_id,
      });
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
      <Divider style={{ color: "#666" }}>
        {label ?? `Create a ${workspaceLabel}`}
      </Divider>
      <Space direction="vertical" style={{ width: "100%" }}>
        {error && <Alert type="error" message={error} showIcon />}
        {state == "creating" && (
          <div style={{ textAlign: "center" }}>
            <Loading style={{ fontSize: "16pt" }}>
              Creating {workspaceLabelLower} "{title}"...
            </Loading>
          </div>
        )}
        {state == "starting" && (
          <div style={{ textAlign: "center" }}>
            <Loading style={{ fontSize: "16pt" }}>
              Starting {workspaceLabelLower} "{title}"...
            </Loading>
          </div>
        )}
        {state == "created" && (
          <div>
            <Icon
              name="check"
              style={{ color: "darkgreen", fontSize: "16pt" }}
            />{" "}
            Created {workspaceLabelLower}{" "}
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
          placeholder={`${workspaceLabel} title (easily change this at any time)`}
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
            <Icon name="plus-circle" /> Create New {workspaceLabel}
          </Button>
        )}
      </Space>
    </div>
  );
}
