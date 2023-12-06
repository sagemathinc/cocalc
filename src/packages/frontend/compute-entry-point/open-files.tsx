import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Select } from "antd";

export default function OpenFiles({ project_id, currentFile, setCurrentFile }) {
  const openFiles = useTypedRedux({ project_id }, "open_files");
  const options = Object.keys(openFiles.toJS()).map((name) => {
    return { label: name, value: name };
  });
  const filterOption = (
    input: string,
    option?: { label: string; value: string },
  ) => (option?.label ?? "").toLowerCase().includes(input.toLowerCase());

  return (
    <Select
      showSearch
      allowClear
      placeholder="Open Files..."
      value={currentFile ? currentFile : undefined}
      onChange={setCurrentFile}
      style={{ width: "100%" }}
      options={options}
      optionFilterProp="children"
      filterOption={filterOption}
    />
  );
}
