import { useEffect, useState } from "react";
import {
  Alert,
  Checkbox,
  Button,
  Popover,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "antd";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { SettingBox } from "@cocalc/frontend/components/setting-box";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import type { Purchase, Description } from "@cocalc/util/db-schema/purchases";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";
import ServiceTag from "./service";
import { capitalize, plural } from "@cocalc/util/misc";
import { SiteLicensePublicInfo as License } from "@cocalc/frontend/site-licenses/site-license-public-info-component";
import Next from "@cocalc/frontend/components/next";
import { open_new_tab } from "@cocalc/frontend/misc/open-browser-tab";
import { currency } from "./quota-config";
import DynamicallyUpdatingCost from "./pay-as-you-go/dynamically-updating-cost";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import { load_target } from "@cocalc/frontend/history";

const DEFAULT_LIMIT = 100;

interface Props {
  project_id?: string; // if given, restrict to only purchases that are for things in this project
  group?: boolean; // default
}

export default function Purchases(props: Props) {
  const is_commercial = useTypedRedux("customize", "is_commercial");
  if (!is_commercial) {
    return null;
  }
  return <Purchases0 {...props} />;
}

function Purchases0({ project_id, group: group0 }: Props) {
  const [purchases, setPurchases] = useState<Partial<Purchase>[] | null>(null);
  const [group, setGroup] = useState<boolean>(!!group0);
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
          <Button
            style={{ marginRight: "15px", float: "right" }}
            onClick={() => {
              getPurchases();
            }}
          >
            <Icon name="refresh" /> Refresh
          </Button>
          {project_id ? (
            <span>
              {project_id ? (
                <a onClick={() => load_target("settings/purchases")}>
                  Purchases
                </a>
              ) : (
                "Purchases"
              )}{" "}
              in <ProjectTitle project_id={project_id} trunc={30} />
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
      <Next
        style={{ float: "right", fontSize: "11pt" }}
        href={"billing/receipts"}
      >
        <Button type="link" style={{ float: "right" }}>
          <Icon name="external-link" /> Receipts
        </Button>
      </Next>
      <Checkbox
        checked={group}
        onChange={(e) => handleGroupChange(e.target.checked)}
      >
        Group transactions
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
          title: "Transactions",
          dataIndex: "count",
          key: "count",
          sorter: (a: any, b: any) => (a.count ?? 0) - (b.count ?? 0),
          sortDirections: ["ascend", "descend"],
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
    <div style={{ overflow: "auto" }}>
      <div style={{ width: "1000px" }}>
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
              sorter: (a, b) =>
                (a.service ?? "").localeCompare(b.service ?? ""),
              sortDirections: ["ascend", "descend"],
              render: (service) => <ServiceTag service={service} />,
            },
            {
              title: "Time",
              dataIndex: "time",
              key: "time",
              render: (text, record) => {
                if (record.service == "project-upgrade") {
                  let minutes;
                  if (
                    record.description?.stop != null &&
                    record.description?.start != null
                  ) {
                    minutes = Math.ceil(
                      (record.description.stop - record.description.start) /
                        1000 /
                        60
                    );
                  } else {
                    minutes = null;
                  }
                  return (
                    <span>
                      <TimeAgo date={text} />
                      {record.description?.stop != null ? (
                        <>
                          {" "}
                          to <TimeAgo date={record.description?.stop} />
                        </>
                      ) : null}
                      {minutes != null ? (
                        <div>
                          Total: {minutes} {plural(minutes, "minute")}
                        </div>
                      ) : null}
                    </span>
                  );
                }
                return <TimeAgo date={text} />;
              },
              sorter: (a, b) =>
                new Date(a.time ?? 0).getTime() -
                new Date(b.time ?? 0).getTime(),
              sortDirections: ["ascend", "descend"],
            },
            {
              title: "Amount (USD)",
              dataIndex: "cost",
              key: "cost",
              render: (text, record) => {
                if (!text && record.service == "project-upgrade") {
                  const cost = record.description?.quota?.cost;
                  const start = record.description?.start;
                  if (cost != null && start != null) {
                    return (
                      <Space>
                        <DynamicallyUpdatingCost
                          costPerHour={cost}
                          start={start}
                        />
                        <Tag color="green">Active</Tag>
                      </Space>
                    );
                  }
                }
                if (text) {
                  return `$${text?.toFixed(2)}`;
                }
                return "-";
              },
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
              title: "Project",
              dataIndex: "project_id",
              key: "project_id",
              render: (project_id) =>
                project_id ? (
                  <ProjectTitle project_id={project_id} trunc={20} />
                ) : null,
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
                        await webapp_client.purchases_client.getInvoice(
                          invoice_id
                        )
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
              title: "Id",
              dataIndex: "id",
              key: "id",
            },
          ]}
        />
      </div>
    </div>
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
  if (description.type == "project-upgrade") {
    const quota = description?.quota ?? {};
    return <DisplayProjectQuota quota={quota} />;
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

export function DisplayProjectQuota({ quota }: { quota: ProjectQuota }) {
  const v: string[] = [];
  if (quota.disk_quota) {
    v.push(`${quota.disk_quota / 1000} GB disk`);
  }
  if (quota.memory) {
    v.push(`${quota.memory / 1000} GB RAM`);
  }
  if (quota.cores) {
    v.push(`${quota.cores} ${plural(quota.cores, "core")}`);
  }
  if (quota.always_running) {
    v.push("always running");
  }
  if (quota.member_host) {
    v.push("member hosting");
  }
  if (quota.network) {
    v.push("network");
  }
  if (quota.cost) {
    v.push(`${currency(quota.cost)} / hour`);
  }
  return <span>{v.join(", ")}</span>;
}
