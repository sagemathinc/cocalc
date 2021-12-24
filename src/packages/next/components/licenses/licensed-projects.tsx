import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import { Alert, Table } from "antd";
import editURL from "lib/share/edit-url";
import A from "components/misc/A";
import { keys } from "@cocalc/util/misc";
import License from "./license";
import { r_join } from "@cocalc/frontend/components/r_join";

const columns = [
  {
    title: "Name",
    dataIndex: "title",
    key: "title",
    width: "30%",
    render: (title, { project_id }) => (
      <div style={{ wordWrap: "break-word", wordBreak: "break-word" }}>
        <A href={editURL({ project_id, type: "collaborator" })} external>
          {title}
        </A>
      </div>
    ),
  },
  {
    title: "Licenses",
    dataIndex: "site_license",
    key: "site_license",
    render: (site_licenses, { project_id }) => (
      <div style={{ wordWrap: "break-word", wordBreak: "break-word" }}>
        {r_join(
          keys(site_licenses).map((license_id) => (
            <License
              key={license_id}
              license_id={license_id}
              contrib={{ [project_id]: site_licenses[license_id] }}
            />
          ))
        )}
      </div>
    ),
  },
  {
    title: "Last Edited",
    dataIndex: "last_edited",
    key: "last_edited",
    render: (last_edited) => new Date(parseFloat(last_edited)).toLocaleString(),
  },
  {
    title: "",
    dataIndex: "hidden",
    key: "hidden",
    width: "10%",
    render: (hidden) => (hidden ? "Hidden" : ""),
  },
];

export default function LicensedProjects() {
  const { result, error } = useAPI("licenses/get-projects");
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading />;
  }
  return (
    <div>
      <h3>Licensed Projects You Collaborate On</h3>
      <Table columns={columns} dataSource={result} rowKey={"project_id"} />
    </div>
  );
}
