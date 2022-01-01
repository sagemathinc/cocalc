import { useState } from "react";
import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import { Alert, Input, Popover, Table } from "antd";
import editURL from "lib/share/edit-url";
import A from "components/misc/A";
import { cmp, keys } from "@cocalc/util/misc";
import License from "./license";
import { r_join } from "@cocalc/frontend/components/r_join";
import { Icon } from "@cocalc/frontend/components/icon";
import { search_split, search_match } from "@cocalc/util/misc";
import Timestamp from "components/misc/timestamp";

const columns = [
  {
    title: "Project Title",
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
    sorter: { compare: (a, b) => cmp(a.title, b.title) },
  },
  {
    title: (
      <Popover
        placement="bottom"
        title="Licenses"
        content={
          <div style={{ maxWidth: "75ex" }}>
            These licenses are all applied to the project. They may or may not
            contribute any upgrades, depending on how the license is being used
            across all projects.
          </div>
        }
      >
        Licenses
      </Popover>
    ),
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
          )),
          <br />
        )}
      </div>
    ),
    sorter: {
      compare: (a, b) =>
        cmp(`${keys(a.site_licenses)}`, `${keys(b.site_licenses)}`),
    },
  },
  {
    title: (
      <Popover
        placement="bottom"
        title="Project Last Edited"
        content={
          <div style={{ maxWidth: "75ex" }}>
            When the project was last edited.
          </div>
        }
      >
        Project Last Edited
      </Popover>
    ),
    dataIndex: "last_edited",
    key: "last_edited",
    render: (last_edited) => <Timestamp epoch={last_edited} />,
    sorter: { compare: (a, b) => cmp(a.last_edited, b.last_edited) },
  },
  {
    title: (
      <Popover
        placement="bottom"
        title="Project Hidden"
        content={
          <div style={{ maxWidth: "75ex" }}>
            Whether or not the project is "hidden" from you, so it doesn't
            appear in your default list of projects. Typically all student
            projects in a course you teach are hidden. There is a checkmark
            below for hidden projects.
          </div>
        }
      >
        Project Hidden
      </Popover>
    ),
    dataIndex: "hidden",
    key: "hidden",
    width: "10%",
    render: (hidden) =>
      hidden ? (
        <div style={{ textAlign: "center" }}>
          <Icon name="check" />
        </div>
      ) : (
        ""
      ),
    sorter: { compare: (a, b) => cmp(a.hidden, b.hidden) },
  },
];

export default function LicensedProjects() {
  const [search, setSearch] = useState<string>("");
  let { result, error } = useAPI("licenses/get-projects");
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading />;
  }
  if (search) {
    result = doSearch(result, search);
  }
  return (
    <div>
      <h3>Licensed Projects On Which You Collaborate ({result.length})</h3>
      <div style={{ marginBottom: "15px" }}>
        <Input.Search
          placeholder="Search..."
          allowClear
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "40ex" }}
        />
      </div>
      <Table
        columns={columns}
        dataSource={result}
        rowKey={"project_id"}
        pagination={{ hideOnSinglePage: true, pageSize: 100 }}
      />
    </div>
  );
}

function doSearch(data: object[], search: string): object[] {
  const v = search_split(search.toLowerCase().trim());
  const w: object[] = [];
  for (const x of data) {
    if (x["search"] == null) {
      x["search"] = `${x["title"]}${JSON.stringify(
        keys(x["site_license"])
      )}`.toLowerCase();
    }
    if (search_match(x["search"], v)) {
      w.push(x);
    }
  }
  return w;
}
