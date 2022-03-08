/* Select one of the projects the signed in user is a collaborator on. */

import { useMemo } from "react";
import useDatabase from "lib/hooks/database";
import { Alert, Divider, Select, Space } from "antd";
import Loading from "components/share/loading";
import { field_cmp } from "@cocalc/util/cmp";

interface Props {
  label?: string;
  onChange: (project: { project_id: string; title: string }) => void;
}

export default function SelectProject({ label, onChange }: Props) {
  const { error, value, loading } = useDatabase({
    projects: [{ title: null, project_id: null, last_edited: null }],
  });
  const projects = useMemo(() => {
    if (loading) {
      return [];
    }
    const cmp = field_cmp("last_edited");
    value.projects.sort((a, b) => cmp(b, a)); // so newest first
    const v: { label: string; value: string }[] = [];
    for (const x of value.projects) {
      v.push({
        label: x.title,
        value: JSON.stringify({ project_id: x.project_id, title: x.title }),
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
              showSearch
              style={{ width: "100%" }}
              placeholder={"Select a project..."}
              optionFilterProp="label"
              options={projects}
              onChange={(x) => (x ? onChange(JSON.parse(`${x}`)) : undefined)}
            />
          ) : (
            <div>You do not have any projects yet.</div>
          ))}
      </Space>
    </div>
  );
}
