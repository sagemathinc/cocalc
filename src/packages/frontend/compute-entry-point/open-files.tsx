import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Select } from "antd";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { useMemo } from "react";
import { cmp } from "@cocalc/util/misc";

export default function OpenFiles({
  project_id,
  compute_server_id,
  currentFile,
  setCurrentFile,
}) {
  const openFiles = useTypedRedux({ project_id }, "open_files");
  const computeServerAssociations = useMemo(() => {
    return webapp_client.project_client.computeServers(project_id);
  }, [project_id]);
  const options = Object.keys(openFiles.toJS())
    .map((name) => {
      return { label: name, value: name, search: name.toLowerCase() };
    })
    .sort((x, y) => cmp(x.search, y.search));

  const filterOption = (
    input: string,
    option?: { label: string; value: string; search: string },
  ) => (option?.search ?? "").includes(input.toLowerCase());

  return (
    <Select
      showSearch
      allowClear
      placeholder="Open Files..."
      value={currentFile ? currentFile : undefined}
      onChange={(path) => {
        setCurrentFile(path);
        if (path && path.endsWith(".ipynb")) {
          computeServerAssociations.connectComputeServerToPath({
            id: compute_server_id,
            path,
          });
        }
      }}
      style={{ width: "100%" }}
      options={options}
      optionFilterProp="children"
      filterOption={filterOption}
    />
  );
}
