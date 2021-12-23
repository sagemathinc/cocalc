import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import { Alert, Table } from "antd";

const columns = [
  {
    title: "Type",
    dataIndex: "object",
    key: "type",
    width: "30%",
    render: (title) => (
      <div style={{ wordWrap: "break-word", wordBreak: "break-word" }}>
        {title}
      </div>
    ),
  },
  {
    title: "Licenses",
    dataIndex: "site_license",
    key: "site_license",
    render: (site_licenses) => (
      <div style={{ wordWrap: "break-word", wordBreak: "break-word" }}>
        {JSON.stringify(site_licenses)}
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

export default function Subscriptions() {
  const { result, error } = useAPI("billing/get-subscriptions");
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading />;
  }
  return (
    <div>
      <h3>Your Subscriptions</h3>
      <Table columns={columns} dataSource={result.data} rowKey={"id"} />
      <pre>{JSON.stringify(result, undefined, 2)}</pre>
    </div>
  );
}
