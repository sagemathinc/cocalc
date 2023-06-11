import { useEffect, useState } from "react";
import { Alert, Checkbox, Button, Spin, Table } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { SettingBox } from "@cocalc/frontend/components/setting-box";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";

const DEFAULT_LIMIT = 20;

interface Props {
  project_id?: string; // if given, restrict to only purchases that are for things in this project
}

export default function PayAsYouGoPurchases(props: Props) {
  const is_commercial = useTypedRedux("customize", "is_commercial");
  if (!is_commercial) {
    return null;
  }
  return <PayAsYouGoPurchases0 {...props} />;
}

function PayAsYouGoPurchases0({ project_id }: Props) {
  const [purchases, setPurchases] = useState<Partial<Purchase>[] | null>(null);
  const [group, setGroup] = useState<boolean>(true);
  const [paid, setPaid] = useState<boolean>(false);
  const [service /*, setService*/] = useState<Service | undefined>(undefined);
  const [error, setError] = useState<string>("");
  const [limit /*, setLimit*/] = useState<number>(DEFAULT_LIMIT);
  const [offset, setOffset] = useState<number>(0);
  const [total, setTotal] = useState<number | null>(null);

  const handleGroupChange = (checked: boolean) => {
    setTotal(null);
    setPurchases(null);
    setGroup(checked);
  };
  const handlePaidChange = (checked: boolean) => {
    setTotal(null);
    setPurchases(null);
    setPaid(checked);
  };

  const getNextPage = () => {
    setOffset((prevOffset) => prevOffset + limit);
  };

  const getPrevPage = () => {
    setOffset((prevOffset) => Math.max(prevOffset - limit, 0));
  };

  const getPurchases = async () => {
    setError("");
    try {
      setTotal(null);
      setPurchases(null);
      const x = await webapp_client.purchases_client.getPurchases({
        limit,
        offset,
        group,
        paid,
        service,
        project_id,
      });
      setPurchases(x);
      let t = 0;
      for (const row of x) {
        t += row["sum"] ?? row["cost"] ?? 0;
      }
      setTotal(t);
    } catch (err) {
      setError(`${err}`);
    }
  };
  useEffect(() => {
    getPurchases();
  }, [limit, offset, group, paid, service, project_id]);

  return (
    <SettingBox
      title={
        project_id ? (
          <span style={{ marginLeft: "5px" }}>
            Pay-as-you-go purchases for the project{" "}
            <ProjectTitle project_id={project_id} trunc={30} />
          </span>
        ) : (
          <span style={{ marginLeft: "5px" }}>Pay as you go purchases</span>
        )
      }
      icon="credit-card"
    >
      {error && (
        <Alert
          type="error"
          description={error}
          onClose={getPurchases}
          closable
        />
      )}
      <Button style={{ marginRight: "15px" }} onClick={() => getPurchases()}>
        <Icon name="refresh" /> Refresh
      </Button>
      <Checkbox
        checked={paid}
        onChange={(e) => handlePaidChange(e.target.checked)}
      >
        Paid
      </Checkbox>
      <Checkbox
        checked={group}
        onChange={(e) => handleGroupChange(e.target.checked)}
      >
        Combine Charges by Service{project_id ? "" : " and Project"}
      </Checkbox>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        <Button.Group>
          {offset > 0 && (
            <Button type="default" onClick={getPrevPage}>
              Previous
            </Button>
          )}
          {purchases && purchases.length >= limit && (
            <Button type="default" onClick={getNextPage}>
              Next
            </Button>
          )}
        </Button.Group>
        {purchases && purchases.length > 0 && (
          <div style={{ marginLeft: "10px" }}>
            Page {Math.floor(offset / limit) + 1}
          </div>
        )}
      </div>
      {total != null && <div>Total: ${total?.toFixed(2)}</div>}
      <div style={{ textAlign: "center" }}>
        {!group && <DetailedPurchaseTable purchases={purchases} />}
        {group && <GroupedPurchaseTable purchases={purchases} />}
      </div>
    </SettingBox>
  );
}

function GroupedPurchaseTable({ purchases }) {
  if (purchases == null) {
    return <Spin size="large" />;
  }
  return (
    <Table
      scroll={{ y: 400 }}
      pagination={false}
      dataSource={purchases}
      rowKey={({ service, project_id, paid }) =>
        `${service}-${project_id}-${paid}`
      }
      columns={[
        {
          title: "Service",
          dataIndex: "service",
          key: "service",
          sorter: (a, b) =>
            (a.service ?? "").localeCompare(b.service ?? "") ?? -1,
          sortDirections: ["ascend", "descend"],
        },
        {
          title: "Total Cost",
          dataIndex: "sum",
          key: "sum",
          render: (text) => `$${text?.toFixed(2)}`,
          sorter: (a: any, b: any) => (a.sum ?? 0) - (b.sum ?? 0),
          sortDirections: ["ascend", "descend"],
        },
        {
          title: "Paid",
          dataIndex: "paid",
          key: "paid",
          render: (text) => (text ? "Yes" : "No"),
        },
        {
          title: "Project",
          dataIndex: "project_id",
          key: "project_id",
          render: (project_id) =>
            project_id ? (
              <ProjectTitle project_id={project_id} trunc={15} />
            ) : null,
        },
      ]}
    />
  );
}

function DetailedPurchaseTable({ purchases }) {
  if (purchases == null) {
    return <Spin size="large" />;
  }
  return (
    <Table
      scroll={{ y: 400 }}
      pagination={false}
      dataSource={purchases}
      rowKey="id"
      columns={[
        {
          title: "Time",
          dataIndex: "time",
          key: "time",
          render: (text) => <TimeAgo date={text} />,
          sorter: (a, b) =>
            new Date(a.time ?? 0).getTime() - new Date(b.time ?? 0).getTime(),
          sortDirections: ["ascend", "descend"],
        },
        {
          title: "Service",
          dataIndex: "service",
          key: "service",
          sorter: (a, b) => (a.service ?? "").localeCompare(b.service ?? ""),
          sortDirections: ["ascend", "descend"],
        },
        {
          title: "Cost",
          dataIndex: "cost",
          key: "cost",
          render: (text) => `$${text?.toFixed(2)}`,
          sorter: (a, b) => (a.cost ?? 0) - (b.cost ?? 0),
          sortDirections: ["ascend", "descend"],
        },
        //             {
        //               title: "Description",
        //               dataIndex: "description",
        //               key: "description",
        //               render: (_, record) => JSON.stringify(record.description),
        //             },
        {
          title: "Invoice ID",
          dataIndex: "invoice_id",
          key: "invoice_id",
          sorter: (a, b) =>
            (a.invoice_id ?? "").localeCompare(b.invoice_id ?? "") ?? -1,
          sortDirections: ["ascend", "descend"],
        },
        {
          title: "Paid",
          dataIndex: "paid",
          key: "paid",
          render: (text) => (text ? "Yes" : "No"),
        },
        {
          title: "Project",
          dataIndex: "project_id",
          key: "project_id",
          render: (project_id) =>
            project_id ? (
              <ProjectTitle project_id={project_id} trunc={15} />
            ) : null,
        },
      ]}
    />
  );
}
