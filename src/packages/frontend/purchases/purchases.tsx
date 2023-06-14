import { useEffect, useState } from "react";
import { Alert, Checkbox, Button, Popover, Spin, Table, Tooltip } from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { SettingBox } from "@cocalc/frontend/components/setting-box";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import type { Purchase, Description } from "@cocalc/util/db-schema/purchases";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";
import ServiceTag from "./service";
import { capitalize } from "@cocalc/util/misc";
import { SiteLicensePublicInfo as License } from "@cocalc/frontend/site-licenses/site-license-public-info-component";
import Next from "@cocalc/frontend/components/next";
import { open_new_tab } from "@cocalc/frontend/misc/open-browser-tab";

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
  const [group, setGroup] = useState<boolean>(true);
  const [service /*, setService*/] = useState<Service | undefined>(undefined);
  const [error, setError] = useState<string>("");
  const [limit /*, setLimit*/] = useState<number>(DEFAULT_LIMIT);
  const [offset, setOffset] = useState<number>(0);
  const [thisMonth, setThisMonth] = useState<boolean>(true);
  const [total, setTotal] = useState<number | null>(null);

  const handleGroupChange = (checked: boolean) => {
    setTotal(null);
    setPurchases(null);
    setGroup(checked);
  };

  const handleThisMonthChange = (checked: boolean) => {
    setTotal(null);
    setPurchases(null);
    setThisMonth(checked);
  };

  const getNextPage = () => {
    setOffset((prevOffset) => prevOffset + limit);
  };

  const getPrevPage = () => {
    setOffset((prevOffset) => Math.max(prevOffset - limit, 0));
  };

  const getPurchases = async () => {
    try {
      setTotal(null);
      setPurchases(null);
      const x = await webapp_client.purchases_client.getPurchases({
        thisMonth, // if true used instead of limit/offset
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
  }, [limit, offset, group, service, project_id, thisMonth]);

  return (
    <SettingBox
      title={
        <>
          <Next style={{ float: "right" }} href={"billing/receipts"}>
            Invoices and Receipts...
          </Next>
          {project_id ? (
            <span>
              Purchases specific to{" "}
              <ProjectTitle project_id={project_id} trunc={30} />
            </span>
          ) : (
            <span>
              Transactions{" "}
              {thisMonth
                ? " (this billing month)"
                : purchases?.length == limit
                ? ` (most recent ${limit} transactions)`
                : " (all time)"}
            </span>
          )}
        </>
      }
    >
      {error && (
        <Alert
          type="error"
          description={error}
          onClose={getPurchases}
          closable
        />
      )}
      <Button
        style={{ marginRight: "15px" }}
        onClick={() => {
          getPurchases();
        }}
      >
        <Icon name="refresh" /> Refresh
      </Button>
      <Checkbox
        checked={!group}
        onChange={(e) => handleGroupChange(!e.target.checked)}
      >
        All transactions
      </Checkbox>
      <Checkbox
        checked={thisMonth}
        onChange={(e) => handleThisMonthChange(e.target.checked)}
      >
        Current billing month
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
          Total of Displayed Costs: ${total.toFixed(2)}
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
          title: "Project",
          dataIndex: "project_id",
          key: "project_id",
          render: (project_id) =>
            project_id ? (
              <ProjectTitle project_id={project_id} trunc={30} />
            ) : (
              "-"
            ),
        },
        {
          title: "Total Amount (USD)",
          dataIndex: "sum",
          key: "sum",
          render: (text) => `$${text?.toFixed(2)}`,
          sorter: (a: any, b: any) => (a.sum ?? 0) - (b.sum ?? 0),
          sortDirections: ["ascend", "descend"],
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
            <Description description={record.description} />
          ),
        },
        {
          title: "Invoice",
          dataIndex: "invoice_id",
          key: "invoice_id",
          sorter: (a, b) =>
            (a.invoice_id ?? "").localeCompare(b.invoice_id ?? "") ?? -1,
          sortDirections: ["ascend", "descend"],
          render: (invoice_id) => {
            if (!invoice_id) return null;
            return (
              <Button
                type="link"
                onClick={async () => {
                  const invoiceUrl = (
                    await webapp_client.purchases_client.getInvoice(invoice_id)
                  ).hosted_invoice_url;
                  open_new_tab(invoiceUrl, false);
                }}
              >
                <Icon name="external-link" /> Invoice
              </Button>
            );
          },
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

// "credit" | "openai-gpt-4" | "project-upgrade" | "license"

function Description({ description }: { description?: Description }) {
  if (description == null) {
    return null;
  }
  if (description.type == "openai-gpt-4") {
    return (
      <Tooltip
        title={() => (
          <div>
            Prompt tokens: {description.prompt_tokens}
            <br />
            Completion tokens: {description.completion_tokens}
          </div>
        )}
      >
        GPT-4
      </Tooltip>
    );
  }
  //             <pre>{JSON.stringify(description, undefined, 2)}</pre>
  if (description.type == "license") {
    return (
      <Popover
        title="License"
        content={() => (
          <>
            {description.license_id && (
              <License license_id={description.license_id} />
            )}
          </>
        )}
      >
        License
      </Popover>
    );
  }
  if (description.type == "credit") {
    return <Tooltip title="Thank you!">Credit</Tooltip>;
  }
  // generic fallback...
  return (
    <>
      <Popover
        title={() => <pre>{JSON.stringify(description, undefined, 2)}</pre>}
      >
        {capitalize(description.type)}
      </Popover>
    </>
  );
}
