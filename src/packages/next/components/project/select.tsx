/* Select one of the projects the signed in user is a collaborator on. */

import { useMemo } from "react";
import useDatabase from "lib/hooks/database";
import { Alert, Divider, Select, Space } from "antd";
import Loading from "components/share/loading";
import { field_cmp } from "@cocalc/util/cmp";

interface Props {
  label?: string;
  project_id?: string;
  onChange: (project_id: string) => void;
}

export default function SelectProject({ label, project_id, onChange }: Props) {
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
      v.push({ label: x.title, value: x.project_id });
    }
    return v;
  }, [loading]);
  return (
    <div>
      <Divider style={{ color: "#666" }}>{label ?? "Select a Project"}</Divider>
      <Space direction="vertical" style={{ width: "100%" }}>
        {error && <Alert type="error" message={error} showIcon />}
        {loading && <Loading />}
        {!loading && !error && value && (
          <Select
            showSearch
            style={{ width: "100%" }}
            placeholder={"Select a project..."}
            optionFilterProp="label"
            options={projects}
            onChange={onChange}
          />
        )}
      </Space>
    </div>
  );
}
