import { ReactNode, useEffect, useState } from "react";
import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import { Alert, TreeSelect } from "antd";
import useCustomize from "lib/use-customize";

interface Node {
  title: ReactNode;
  value: string;
  children?: Node[];
}

interface Props {
  interval?: string; // postgreSQL interval, e.g., "1 day"
  onChange?: (value: string[]) => void;
}

export default function RecentFiles({ interval, onChange }: Props) {
  const { siteURL } = useCustomize();
  const { result, error } = useAPI("file-access", {
    interval: interval ?? "1 day",
  });
  const [treeData, setTreeData] = useState<Node[]>([]);

  function url(project_id: string, path?: string) {
    let s = siteURL + "/" + encodeURI(`projects/${project_id}`);
    if (!path) return s;
    return s + `/files/${path}`;
  }

  useEffect(() => {
    if (!result) return;

    // organize the files by project:
    const projects: {
      [project_id: string]: {
        path: string;
        title: string;
        project_id: string;
      }[];
    } = {};
    for (const file of result.files) {
      if (projects[file.project_id] == null) {
        projects[file.project_id] = [file];
      } else {
        projects[file.project_id].push(file);
      }
    }

    const treeData: Node[] = [];
    for (const project_id in projects) {
      const files = projects[project_id];
      if (files.length == 0) continue;
      const children: Node[] = [];
      treeData.push({
        title: (
          <>
            Project: <b>{files[0].title}</b>
          </>
        ),
        value: url(files[0].project_id),
        children,
      });
      for (const file of files) {
        children.push({
          title: file.path,
          value: url(file.project_id, file.path),
        });
      }
    }

    setTreeData(treeData);
  }, [result]);

  return (
    <div>
      {error && <Alert type="error" message={error} />}
      {result == null ? (
        <Loading />
      ) : (
        <>
          <TreeSelect
            style={{ width: "100%" }}
            treeData={treeData}
            placeholder="Search for relevant files..."
            allowClear
            multiple
            treeDefaultExpandAll={true}
            showSearch
            dropdownStyle={{ maxHeight: 400, overflow: "auto" }}
            onChange={onChange}
          />
        </>
      )}
    </div>
  );
}
