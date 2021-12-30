import { useMemo, useState } from "react";
import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import { Alert, Button, Checkbox, Input, Popover, Table } from "antd";
import { Quota as LicenseQuota } from "./license";
import Avatar from "components/account/avatar";
import { EditableDescription, EditableTitle } from "./editable-license";
import { search_split, search_match } from "@cocalc/util/misc";
import { cmp } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components/icon";
import Timestamp from "components/misc/timestamp";
import License from "./license";
import SelectUsers from "components/account/select-users";
import useCustomize from "lib/use-customize";

const renderTimestamp = (epoch) => <Timestamp epoch={epoch} />;

export const quotaColumn = {
  title: (
    <Popover
      title="Quota"
      content={
        <div style={{ maxWidth: "75ex" }}>
          This is the license quota. If the license is active on a project, its
          quotas will be set to at least the values listed here. If multiple
          licenses are used on the same project, the maximum of the quotas are
          used.
        </div>
      }
    >
      Quota{" "}
    </Popover>
  ),
  width: "25%",
  dataIndex: "quota",
  key: "quota",
  render: (quota, record) => {
    return record.state != null && record.state != "running" ? (
      <div style={{ color: "#666", textAlign: "center" }}>—</div>
    ) : (
      <div
        style={{
          wordWrap: "break-word",
          wordBreak: "break-word",
          color: "#666",
        }}
      >
        {quota && <LicenseQuota quota={quota} />}
        {/* upgrades is deprecated, but in case we encounter it, do not ignore it */}
        {record.upgrades && <pre>{JSON.stringify(record.upgrades)}</pre>}
      </div>
    );
  },
};

function columns(onChange) {
  return [
    {
      title: (
        <Popover
          placement="bottom"
          title="Id, Title and Description of the License"
          content={
            <div style={{ maxWidth: "75ex" }}>
              The first line is the id of the license, which anybody can enter
              in various places to upgrade projects or courses. The title and
              description of the license help you keep track of what the license
              is for, and you can edit both fields here as well by clicking on
              them.
            </div>
          }
        >
          License
        </Popover>
      ),
      dataIndex: "title",
      key: "title",
      width: "40%",
      sorter: { compare: (a, b) => cmp(a.title, b.title) },
      render: (title, record) => (
        <div
          style={{
            wordWrap: "break-word",
            wordBreak: "break-word",
            color: "#333",
            fontSize: "9pt",
          }}
        >
          <div style={{ fontFamily: "monospace", fontSize: "9pt" }}>
            <License license_id={record.id} />
          </div>
          <EditableTitle
            license_id={record.id}
            title={title}
            onChange={onChange}
          />
          <EditableDescription
            license_id={record.id}
            description={record.description}
            onChange={onChange}
          />
        </div>
      ),
    },
    {
      title: (
        <Popover
          title="Managers"
          content={
            <div style={{ maxWidth: "75ex" }}>
              These are the managers of this license. They can see extra
              information about the license, the license is included in any
              dropdown where they can select a license, and they can add or
              remove other license managers. You are a manager of all licenses
              listed here.
            </div>
          }
        >
          Managers
        </Popover>
      ),
      dataIndex: "managers",
      key: "managers",
      render: (managers, record) => (
        <>
          {managers.map((account_id) => (
            <Avatar key={account_id} account_id={account_id} size={32} />
          ))}
          <AddManagers license_id={record.id} managers={managers} />
        </>
      ),
    },
    {
      title: (
        <Popover
          placement="bottom"
          title="Run Limit"
          content={
            <div style={{ maxWidth: "75ex" }}>
              The maximum number of simultaneous running projects that this
              license can upgrade. You can apply the license to any number of
              projects, but it only impacts this many projects at once.
            </div>
          }
        >
          Run Limit
        </Popover>
      ),
      dataIndex: "run_limit",
      key: "run_limit",
      render: (run_limit) => (
        <div style={{ textAlign: "center" }}>{run_limit}</div>
      ),
      sorter: { compare: (a, b) => cmp(a.run_limit, b.run_limit) },
    },
    quotaColumn,
    {
      title: (
        <Popover
          placement="bottom"
          title="When License was Last Used"
          content={
            <div style={{ maxWidth: "75ex" }}>
              This is when this license was last used to upgrade a project when
              the project was starting. It's the point in time when the project
              started.
            </div>
          }
        >
          Last Used{" "}
        </Popover>
      ),
      dataIndex: "last_used",
      key: "last_used",
      render: renderTimestamp,
      sorter: { compare: (a, b) => cmp(a.last_used, b.last_used) },
    },
    {
      title: (
        <Popover
          placement="bottom"
          title="When License Becomes Activate"
          content={
            <div style={{ maxWidth: "75ex" }}>
              This is when the license becomes active. In can be in the future,
              in which case the license will be valid and useful in the future,
              but not right now.
            </div>
          }
        >
          Activates{" "}
        </Popover>
      ),
      dataIndex: "activates",
      key: "activates",
      render: renderTimestamp,
      sorter: { compare: (a, b) => cmp(a.activates, b.activates) },
    },
    {
      title: (
        <Popover
          placement="bottom"
          title="When License Expires"
          content={
            <div style={{ maxWidth: "75ex" }}>
              This is when the license expires. Unless there is a subscription
              that renews it, after this point in time the license will stop
              upgrading projects.
            </div>
          }
        >
          Expires{" "}
        </Popover>
      ),
      dataIndex: "expires",
      key: "expires",
      render: (expires) => (
        <div>
          {renderTimestamp(expires)}
          {expires && expires <= new Date().valueOf() && (
            <div
              style={{
                backgroundColor: "#d00",
                color: "white",
                padding: "0 5px",
              }}
            >
              <Icon name="ban" /> Expired
            </div>
          )}
        </div>
      ),
      sorter: { compare: (a, b) => cmp(a.expires, b.expires) },
    },
    {
      title: (
        <Popover
          placement="bottom"
          title="When License was Created"
          content={
            <div style={{ maxWidth: "75ex" }}>
              This is when the license was created.
            </div>
          }
        >
          Created{" "}
        </Popover>
      ),
      dataIndex: "created",
      key: "created",
      render: renderTimestamp,
      sorter: { compare: (a, b) => cmp(a.created, b.created) },
    },
  ];
}

export default function ManagedLicenses() {
  let { result, error, call } = useAPI("licenses/get-managed");
  const [search, setSearch] = useState<string>("");
  const [showExpired, setShowExpired] = useState<boolean>(false);
  const numExpired: number = useMemo(() => {
    if (!result) return 0;
    let n = 0;
    const t = new Date().valueOf();
    for (const x of result) {
      if (x.expires && x.expires <= t) {
        n += 1;
      }
    }
    return n;
  }, [result]);

  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading style={{ fontSize: "16pt", margin: "auto" }} />;
  }

  if (search) {
    result = doSearch(result, search);
  }
  if (!showExpired) {
    // filter out anything that is expired
    result = removeExpired(result);
  }

  function onChange() {
    call();
  }

  return (
    <div style={{ width: "100%", overflowX: "scroll" }}>
      <h3>Licenses that you Manage</h3>
      These are the licenses that you purchased or manage.
      <div style={{ margin: "15px 0" }}>
        <Checkbox
          disabled={numExpired == 0}
          style={{ float: "right" }}
          checked={showExpired}
          onChange={(e) => setShowExpired(e.target.checked)}
        >
          Show Expired ({numExpired})
        </Checkbox>
        <Input.Search
          placeholder="Search..."
          allowClear
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: "50ex", maxWidth: "100%" }}
        />
      </div>
      <Table
        columns={columns(onChange)}
        dataSource={result}
        rowKey={"id"}
        style={{ marginTop: "15px" }}
        pagination={{ hideOnSinglePage: true, pageSize: 100 }}
      />
      {/* <pre>{JSON.stringify(result, undefined, 2)}</pre> */}
    </div>
  );
}

function doSearch(data: object[], search: string): object[] {
  const v = search_split(search.toLowerCase().trim());
  const w: object[] = [];
  for (const x of data) {
    if (x["search"] == null) {
      x["search"] = `${x["title"] ?? ""} ${x["description"] ?? ""} ${
        x["id"]
      }`.toLowerCase();
    }
    if (search_match(x["search"], v)) {
      w.push(x);
    }
  }
  return w;
}

function removeExpired(data: { expires?: number }[]): { expires?: number }[] {
  const data1: { expires?: number }[] = [];
  const now = new Date().valueOf();
  for (const x of data) {
    if (!(x.expires != null && x.expires <= now)) {
      data1.push(x);
    }
  }
  return data1;
}

interface AddManagersProps {
  license_id: string;
  managers: string[];
}
function AddManagers({ license_id, managers }: AddManagersProps) {
  const [adding, setAdding] = useState<boolean>(false);
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const { account } = useCustomize();
  return (
    <div>
      {adding && (
        <Button
          size="small"
          style={{ float: "right" }}
          onClick={() => setAdding(false)}
        >
          Close
        </Button>
      )}
      <Button
        disabled={adding}
        style={{ marginTop: "5px" }}
        size="small"
        onClick={() => setAdding(!adding)}
      >
        <Icon name="plus-circle" /> Add
      </Button>
      {adding && (
        <div style={{ width: "300px", marginTop: "5px" }}>
          <SelectUsers
            onChange={setAccountIds}
            exclude={managers.concat(
              account?.account_id ? [account.account_id] : []
            )}
          />
        </div>
      )}
    </div>
  );
}
