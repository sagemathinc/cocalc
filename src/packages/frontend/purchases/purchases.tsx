import { useEffect, useState } from "react";
import { Alert, Checkbox, Button, Spin, Table, Tooltip } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { SettingBox } from "@cocalc/frontend/components/setting-box";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";
import ServiceTag from "./service";

const DEFAULT_LIMIT = 100;

interface Props {
  project_id?: string; // if given, restrict to only purchases that are for things in this project
}

export default function Purchases(props: Props) {
  const is_commercial = useTypedRedux("customize", "is_commercial");
  if (!is_commercial) {
    return null;
  }
  return <Purchases0 {...props} />;
}

function Purchases0({ project_id }: Props) {
  const [purchases, setPurchases] = useState<Partial<Purchase>[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [group, setGroup] = useState<boolean>(true);
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

  const getNextPage = () => {
    setOffset((prevOffset) => prevOffset + limit);
  };

  const getPrevPage = () => {
    setOffset((prevOffset) => Math.max(prevOffset - limit, 0));
  };

  const getBalance = async () => {
    try {
      setBalance(null);
      setBalance(await webapp_client.purchases_client.getBalance());
    } catch (err) {
      setError(`${err}`);
    }
  };
  useEffect(() => {
    getBalance();
  }, []);

  const getPurchases = async () => {
    try {
      setTotal(null);
      setPurchases(null);
      const x = await webapp_client.purchases_client.getPurchases({
        limit,
        offset,
        group,
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
  }, [limit, offset, group, service, project_id]);

  return (
    <SettingBox
      title={
        project_id ? (
          <span style={{ marginLeft: "5px" }}>
            Purchases specific to{" "}
            <ProjectTitle project_id={project_id} trunc={30} />
          </span>
        ) : (
          <span style={{ marginLeft: "5px" }}>Purchases</span>
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
      {balance != null && (
        <Tooltip title="Total balance for all purchases across all projects.">
          <div
            style={{
              float: "right",
              fontSize: "12pt",
              color: balance <= 0 ? "darkgreen" : "darkred",
            }}
          >
            Balance: ${balance.toFixed(2)}
          </div>
        </Tooltip>
      )}
      <Button
        style={{ marginRight: "15px" }}
        onClick={() => {
          getBalance();
          getPurchases();
        }}
      >
        <Icon name="refresh" /> Refresh
      </Button>
      <Checkbox
        checked={!group}
        onChange={(e) => handleGroupChange(!e.target.checked)}
      >
        Show individual items
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
        {purchases &&
          purchases.length > 0 &&
          (purchases.length >= limit || offset > 0) && (
            <div style={{ marginLeft: "10px" }}>
              Page {Math.floor(offset / limit) + 1}
            </div>
          )}
      </div>
      <div style={{ textAlign: "center", marginTop: "15px" }}>
        {!group && <DetailedPurchaseTable purchases={purchases} />}
        {group && <GroupedPurchaseTable purchases={purchases} />}
      </div>
      {total != null && (
        <div style={{ fontSize: "12pt", marginTop: "15px" }}>
          Total Displayed Costs: ${total.toFixed(2)}
        </div>
      )}
    </SettingBox>
  );
}

function GroupedPurchaseTable({ purchases }) {
  if (purchases == null) {
    return <Spin size="large" delay={500} />;
  }
  return (
    <Table
      scroll={{ y: 400 }}
      pagination={false}
      dataSource={purchases}
      rowKey={({ service, project_id }) => `${service}-${project_id}`}
      columns={[
        {
          title: "Service",
          dataIndex: "service",
          key: "service",
          sorter: (a, b) =>
            (a.service ?? "").localeCompare(b.service ?? "") ?? -1,
          sortDirections: ["ascend", "descend"],
          render: (service) => <ServiceTag service={service} />,
        },
        {
          title: "Total Amount (USD)",
          dataIndex: "sum",
          key: "sum",
          render: (text) => `$${text?.toFixed(2)}`,
          sorter: (a: any, b: any) => (a.sum ?? 0) - (b.sum ?? 0),
          sortDirections: ["ascend", "descend"],
        },
        {
          title: "Project",
          dataIndex: "project_id",
          key: "project_id",
          render: (project_id) =>
            project_id ? (
              <ProjectTitle project_id={project_id} trunc={20} />
            ) : null,
        },
      ]}
    />
  );
}

function DetailedPurchaseTable({ purchases }) {
  if (purchases == null) {
    return <Spin size="large" delay={500} />;
  }
  return (
    <Table
      scroll={{ y: 400 }}
      pagination={false}
      dataSource={purchases}
      rowKey="id"
      columns={[
        {
          title: "Service",
          dataIndex: "service",
          key: "service",
          sorter: (a, b) => (a.service ?? "").localeCompare(b.service ?? ""),
          sortDirections: ["ascend", "descend"],
          render: (service) => <ServiceTag service={service} />,
        },
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
          title: "Amount (USD)",
          dataIndex: "cost",
          key: "cost",
          render: (text) => `$${text?.toFixed(2)}`,
          sorter: (a, b) => (a.cost ?? 0) - (b.cost ?? 0),
          sortDirections: ["ascend", "descend"],
        },
        {
          title: "Description",
          dataIndex: "description",
          key: "description",
          render: (_, record) => (
            <pre>{JSON.stringify(record.description, undefined, 2)}</pre>
          ),
        },
        {
          title: "Invoice",
          dataIndex: "invoice_id",
          key: "invoice_id",
          sorter: (a, b) =>
            (a.invoice_id ?? "").localeCompare(b.invoice_id ?? "") ?? -1,
          sortDirections: ["ascend", "descend"],
        },
        {
          title: "Project",
          dataIndex: "project_id",
          key: "project_id",
          render: (project_id) =>
            project_id ? (
              <ProjectTitle project_id={project_id} trunc={20} />
            ) : null,
        },
        {
          title: "Id",
          dataIndex: "id",
          key: "id",
        },
      ]}
    />
  );
}
