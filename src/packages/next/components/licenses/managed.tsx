import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import { Alert, Popover, Table } from "antd";
import { Quota as LicenseQuota } from "./license";
import Avatar from "components/account/avatar";
import { EditableDescription, EditableTitle } from "./editable-license";

function renderTimestamp(x) {
  return x ? new Date(x).toLocaleString() : "-";
}

const columns = [
  {
    title: "License",
    dataIndex: "title",
    key: "title",
    width: "40%",
    render: (title, record) => (
      <div
        style={{
          wordWrap: "break-word",
          wordBreak: "break-word",
          color: "#666",
          fontSize: "12px",
        }}
      >
        <div style={{ fontFace: "monospace", fontSize: "10px" }}>
          {record.id}
        </div>
        <EditableTitle license_id={record.id} title={title} />
        <EditableDescription license_id={record.id} description={record.description} />
      </div>
    ),
  },
  {
    title: "Managers",
    dataIndex: "managers",
    key: "managers",
    render: (managers) => (
      <>
        {managers.map((account_id) => (
          <Avatar key={account_id} account_id={account_id} />
        ))}
      </>
    ),
  },
  {
    title: (
      <Popover
        title="Run Limit"
        content={
          <div style={{ maxWidth: "75ex" }}>
            The maximum number of simultaneous running projects that this
            license can upgrade. You can apply the license to any number of
            projects, but it only impacts this many projects at once.
          </div>
        }
      >
        Limit
      </Popover>
    ),
    dataIndex: "run_limit",
    key: "run_limit",
    render: (run_limit) => (
      <div style={{ textAlign: "center" }}>{run_limit}</div>
    ),
  },
  {
    title: "Quota",
    width: "30%",
    dataIndex: "quota",
    key: "quota",
    render: (quota, record) => {
      return (
        <div
          style={{
            wordWrap: "break-word",
            wordBreak: "break-word",
            color: "#666",
          }}
        >
          <LicenseQuota quota={quota} />
          {/* upgrades is deprecated, but in case we encounter it, do not ignore it */}
          {record.upgrades && <pre>{JSON.stringify(record.upgrades)}</pre>}
        </div>
      );
    },
  },
  {
    title: "Last Used",
    dataIndex: "last_used",
    key: "last_used",
    render: renderTimestamp,
  },
  {
    title: "Activates",
    dataIndex: "activates",
    key: "activates",
    render: renderTimestamp,
  },
  {
    title: "Expires",
    dataIndex: "expires",
    key: "expires",
    render: renderTimestamp,
  },
  {
    title: "Created",
    dataIndex: "created",
    key: "created",
    render: renderTimestamp,
  },
];

export default function ManagedLicenses() {
  const { result, error } = useAPI("licenses/get-managed");
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading />;
  }
  return (
    <div style={{ width: "100%", overflowX: "scroll" }}>
      <h3>Licenses that you Manage</h3>
      These are the licenses that you purchased or manage.
      <Table
        columns={columns}
        dataSource={result}
        rowKey={"id"}
        style={{ marginTop: "15px" }}
        pagination={{ hideOnSinglePage: true, pageSize: 100 }}
      />
      {/* <pre>{JSON.stringify(result, undefined, 2)}</pre> */}
    </div>
  );
}
