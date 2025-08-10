import { useRef, useState } from "react";
import { Button, Input, Popconfirm, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { redux } from "@cocalc/frontend/app-framework";

interface Props {
  project_id: string;
  flyout?: boolean;
}

export default function ForkProject({ project_id, flyout }: Props) {
  const titleRef = useRef<string>("");
  return (
    <Popconfirm
      title={
        <div style={{ maxWidth: "450px" }}>
          Create a new fork of <ProjectTitle project_id={project_id} noClick />
        </div>
      }
      description={() => (
        <Description project_id={project_id} titleRef={titleRef} />
      )}
      onConfirm={async () => {
        const project = redux
          .getStore("projects")
          .getIn(["project_map", project_id])
          ?.toJS();
        const new_project_id = await webapp_client.project_client.create({
          title: titleRef.current,
          description: project?.description ?? "",
          src_project_id: project_id,
          image: project?.compute_image,
        });
        redux
          .getActions("projects")
          .open_project({ project_id: new_project_id });
      }}
      okText="Create Fork"
      cancelText="Cancel"
    >
      <Tooltip
        title={
          <>
            Fork your own copy of "
            <ProjectTitle project_id={project_id} noClick />"
          </>
        }
      >
        <Button>
          <Icon name="fork-outlined" />
          {!flyout && <> Fork</>}
        </Button>
      </Tooltip>
    </Popconfirm>
  );
}

function Description({ project_id, titleRef }) {
  const [title, setTitle] = useState<string>(
    `Clone of ${
      redux.getStore("projects").getIn(["project_map", project_id, "title"]) ??
      "project"
    }`,
  );
  return (
    <div style={{ maxWidth: "500px" }}>
      A fork is an exact copy of a project. Forking a project allows you to
      freely make changes without affecting the original project. Snapshots and
      collaborators are not included.
      <Input
        placeholder="Title of clone... (you can change this later)"
        allowClear
        style={{ marginTop: "5px" }}
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          titleRef.current = e.target.value;
        }}
      />
    </div>
  );
}
