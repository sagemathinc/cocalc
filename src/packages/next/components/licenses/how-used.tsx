import { useEffect, useMemo, useState } from "react";
import Loading from "components/share/loading";
import { Alert, Checkbox, Input, Popover, Table } from "antd";
import SelectLicense from "./select-license";
import Avatar from "components/account/avatar";
import { search_split, search_match } from "@cocalc/util/misc";
import A from "components/misc/A";
import apiPost from "lib/api/post";
import { capitalize, cmp } from "@cocalc/util/misc";
import editURL from "lib/share/edit-url";
import { Details as License } from "./license";
import { quotaColumn, Quota } from "./managed";
import { useRouter } from "next/router";
import Copyable from "components/misc/copyable";
import { LastEdited } from "./licensed-projects";

function TitleId({ title, project_id, collaborators, account_id, label }) {
  return (
    <div style={{ wordWrap: "break-word", wordBreak: "break-word" }}>
      {collaborators.includes(account_id) ? (
        <A href={editURL({ project_id, type: "collaborator" })} external>
          {title}
        </A>
      ) : (
        title
      )}
      {label && (
        <>
          <br />
          Project Id:
        </>
      )}
      <Copyable text={project_id} size="small" />
    </div>
  );
}

function Collaborators({ collaborators }) {
  return (
    <>
      {collaborators.map((account_id) => (
        <Avatar
          key={account_id}
          account_id={account_id}
          size={24}
          style={{ marginRight: "2.5px" }}
        />
      ))}
    </>
  );
}

function State({ state }) {
  return <>{capitalize(state)}</>;
}

export default function HowLicenseUsed({ account_id }) {
  const router = useRouter();
  const [license, setLicense] = useState<string>(
    `${router.query.license_id ?? ""}`
  );
  const [search, setSearch] = useState<string>("");
  const [error, setError] = useState<string>("");
  let [projects, setProjects] = useState<object[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [excludeMe, setExcludeMe] = useState<boolean>(false);

  const columns = useMemo(() => {
    return [
      {
        responsive: ["xs"],
        render: (_, project) => (
          <div>
            <TitleId {...project} account_id={account_id} label />
            <div>
              Last Edited: <LastEdited {...project} />
            </div>
            <div>
              State: <State {...project} />
            </div>
            <div>
              Collaborators: <Collaborators {...project} />
            </div>
            <div>
              {"Quota in use: "}
              <Quota {...project} />
            </div>
          </div>
        ),
      },
      {
        responsive: ["sm"],
        title: (
          <Popover
            placement="bottom"
            title="Project"
            content={
              <div style={{ maxWidth: "75ex" }}>
                This is the title and id of the project. If you are a
                collaborator on this project, then you can click the title to
                open the project.
              </div>
            }
          >
            Project
          </Popover>
        ),
        width: "30%",
        render: (_, project) => (
          <TitleId {...project} account_id={account_id} />
        ),
        sorter: { compare: (a, b) => cmp(a.title, b.title) },
      },
      {
        responsive: ["sm"],
        title: "Last Edited",
        render: (_, project) => <LastEdited {...project} />,
        sorter: { compare: (a, b) => cmp(a.last_edited, b.last_edited) },
      },
      {
        responsive: ["sm"],
        title: (
          <Popover
            title="Collaborators"
            content={
              <div style={{ maxWidth: "75ex" }}>
                These are the collaborators on this project. You are not
                necessarily included in this list, since this license can be
                applied to any project by somebody who knows the license code.
                Click the "Exclude me" checkbox to see only projects that you
                are <b>not</b> a collaborator on.
              </div>
            }
          >
            Collaborators
            <div style={{ fontWeight: 300 }}>
              <Checkbox
                onChange={(e) => setExcludeMe(e.target.checked)}
                checked={excludeMe}
              >
                Exclude me
              </Checkbox>
            </div>
          </Popover>
        ),
        render: (_, project) => <Collaborators {...project} />,
      },
      {
        responsive: ["sm"],
        title: "State",
        dataIndex: "state",
        key: "state",
        sorter: { compare: (a, b) => cmp(a.state, b.state) },
        render: (_, project) => <State {...project} />,
      },
      quotaColumn,
    ];
  }, [account_id, excludeMe]);

  async function load(license_id) {
    setLicense(license_id);
    setError("");
    if (license_id) {
      setLoading(true);
      setProjects([]);
      try {
        setProjects(
          await apiPost("/licenses/get-projects-with-license", {
            license_id,
          })
        );
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    // initial license load (e.g., from query param)
    if (license) {
      load(license);
    }
  }, []);

  return (
    <div style={{ width: "100%", overflowX: "scroll" }}>
      <h3>How a License You Manage is Being Used</h3>
      Select a license you manage to see how it is being used. You can see{" "}
      <i>all</i> projects that have this license applied to them (even if you
      are not a collaborator on them!), remove licenses from projects, and view
      analytics about how the license has been used over time to better inform
      your decision making.
      <div style={{ margin: "15px 0", width: "100%" }}>
        <SelectLicense
          disabled={loading}
          onSelect={(license_id) => {
            router.push({
              pathname: router.asPath.split("?")[0],
              query: { license_id },
            });
            load(license_id);
          }}
          license={license}
          style={{ width: "100%", maxWidth: "90ex" }}
        />
      </div>
      {license && error && <Alert type="error" message={error} />}
      {license && loading && (
        <Loading style={{ fontSize: "16pt", margin: "auto" }} />
      )}
      <div
        style={{
          border: "1px solid lightgrey",
          borderRadius: "5px",
          padding: "15px",
          backgroundColor: "#fafafa",
          width: "100%",
          maxWidth: "90ex",
        }}
      >
        {license ? (
          <License license_id={license} />
        ) : (
          <div style={{ textAlign: "center", fontSize: "13pt" }}>
            Select a license above.
          </div>
        )}
      </div>
      {license && !loading && projects.length > 1 && (
        <div style={{ margin: "15px 0", maxWidth: "50ex" }}>
          <Input.Search
            placeholder="Search project titles..."
            allowClear
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
      )}
      {license && !loading && (
        <Table
          columns={columns as any}
          dataSource={doSearch(projects, search, excludeMe, account_id)}
          rowKey={"project_id"}
          style={{ marginTop: "15px" }}
          pagination={{ hideOnSinglePage: true, pageSize: 100 }}
        />
      )}
    </div>
  );
}

function doSearch(
  data: object[],
  search: string,
  excludeMe: boolean,
  account_id: string
): object[] {
  const v = search_split(search.toLowerCase().trim());
  const w: object[] = [];
  for (const x of data) {
    if (excludeMe && x["collaborators"]?.includes(account_id)) continue;
    if (x["search"] == null) {
      x["search"] = `${x["title"] ?? ""} ${x["id"]}`.toLowerCase();
    }
    if (search_match(x["search"], v)) {
      w.push(x);
    }
  }
  return w;
}
