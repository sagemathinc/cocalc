import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { Button, Input, Popconfirm, Spin, Tooltip } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { redux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { useIntl } from "react-intl";
import { labels } from "@cocalc/frontend/i18n";

interface Props {
  project_id: string;
  flyout?: boolean;
}

export default function CloneProject({ project_id, flyout }: Props) {
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<any>(null);
  const titleRef = useRef<string>("");
  const intl = useIntl();
  const projectLabelLower = intl.formatMessage(labels.project).toLowerCase();
  return (
    <Popconfirm
      title={
        <div style={{ maxWidth: "450px" }}>
          Create a clone of "<ProjectTitle project_id={project_id} noClick />"
        </div>
      }
      description={() => (
        <>
          <Description
            project_id={project_id}
            titleRef={titleRef}
            projectLabelLower={projectLabelLower}
          />
          <ShowError error={error} setError={setError} />
        </>
      )}
      onConfirm={async () => {
        try {
          setSaving(true);
          setError("");
          await redux
            .getActions("projects")
            .cloneProject({ project_id, title: titleRef.current });
        } catch (err) {
          setError(err);
        } finally {
          setSaving(false);
        }
      }}
      okText="Create Clone"
      cancelText="Cancel"
    >
      <Tooltip
        title={
          <>
            Cloning makes a copy of "
            <ProjectTitle project_id={project_id} noClick />
            ", including any customization to the root filesystem / (e.g.,
            systemwide software install), but without any TimeTravel edit
            history or collaborators. It has the same root filesystem image.
          </>
        }
      >
        <Button disabled={saving}>
          <Icon name="fork-outlined" />
          {!flyout && <> Clone</>}
          {saving && (
            <>
              {" "}
              <Spin />
            </>
          )}
        </Button>
      </Tooltip>
    </Popconfirm>
  );
}

function Description({
  project_id,
  titleRef,
  projectLabelLower,
}: {
  project_id: string;
  titleRef: MutableRefObject<string>;
  projectLabelLower: string;
}) {
  const [title, setTitle] = useState<string>(
    `Clone of ${
      redux.getStore("projects").getIn(["project_map", project_id, "title"]) ??
      projectLabelLower
    }`,
  );
  useEffect(() => {
    titleRef.current = title;
  }, []);
  return (
    <div style={{ maxWidth: "500px" }}>
      A clone is a copy of a {projectLabelLower}, both the HOME directory and
      customizations to the root filesystem /. Cloning a {projectLabelLower}{" "}
      allows you to make changes without affecting the original{" "}
      {projectLabelLower}. Snapshots and collaborators are not included.
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
