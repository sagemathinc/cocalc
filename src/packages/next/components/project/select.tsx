/* Select one of the projects the signed in user is a collaborator on. */

import { Alert, Divider, Select, Space } from "antd";
import { useMemo, type JSX } from "react";

import Loading from "components/share/loading";
import useDatabase from "lib/hooks/database";

import { Icon } from "@cocalc/frontend/components/icon";
import { field_cmp } from "@cocalc/util/cmp";

interface Props {
  label?: string;
  onChange: (project: { project_id: string; title: string }) => void;
  defaultOpen?: boolean;
  allowCreate?: boolean;
}

export default function SelectProject({
  label,
  onChange,
  defaultOpen,
  allowCreate,
}: Props) {
  const { error, value, loading } = useDatabase({
    projects: [{ title: null, project_id: null, last_edited: null }],
  });
  const projects = useMemo(() => {
    if (loading) {
      return [];
    }
    const cmp = field_cmp("last_edited");
    value.projects.sort((a, b) => cmp(b, a)); // so newest first
    const v: { label: string | JSX.Element; value: string }[] = [];
    for (const x of value.projects) {
      v.push({
        label: x.title,
        value: JSON.stringify({ project_id: x.project_id, title: x.title }),
      });
    }
    if (allowCreate) {
      v.push({
        label: (
          <>
            <Icon name="plus-circle" /> Create Project...
          </>
        ),
        value: JSON.stringify({ project_id: "", title: "Untitled Project" }),
      });
    }
    return v;
  }, [loading]);
  return (
    <div>
      <Divider style={{ color: "#666" }}>{label ?? "Select a Project"}</Divider>
      <Space direction="vertical" style={{ width: "100%" }}>
        {error && <Alert type="error" message={error} showIcon />}
        {loading && <Loading style={{ fontSize: "24pt" }} />}
        {!loading &&
          (!error && value && projects.length > 0 ? (
            <Select
              defaultOpen={defaultOpen}
              showSearch
              style={{ width: "100%" }}
              placeholder={"Select a Project..."}
              optionFilterProp="label"
              options={projects}
              onChange={(x) => (x ? onChange(JSON.parse(`${x}`)) : undefined)}
            />
          ) : (
            <div>You do not have any recent projects.</div>
          ))}
      </Space>
    </div>
  );
}
