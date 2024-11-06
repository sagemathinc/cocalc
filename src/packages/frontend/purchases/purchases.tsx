import {
  Button,
  Card,
  Checkbox,
  Flex,
  Popover,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "antd";
import { CSSProperties, useEffect, useState } from "react";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import Next from "@cocalc/frontend/components/next";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import {
  ComputeServerDescription,
  ComputeServerNetworkUsageDescription,
  ComputeServerStorageDescription,
} from "@cocalc/frontend/compute/purchases";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { load_target } from "@cocalc/frontend/history";
import { open_new_tab } from "@cocalc/frontend/misc/open-browser-tab";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { SiteLicensePublicInfo as License } from "@cocalc/frontend/site-licenses/site-license-public-info-component";
import getSupportURL from "@cocalc/frontend/support/url";
import {
  ANTHROPIC_PREFIX,
  GOOGLE_PREFIX,
  LLM_USERNAMES,
  MISTRAL_PREFIX,
  service2model,
} from "@cocalc/util/db-schema/llm-utils";
import {
  QUOTA_SPEC,
  type ProjectQuota,
  type Service,
} from "@cocalc/util/db-schema/purchase-quotas";
import type { Purchase } from "@cocalc/util/db-schema/purchases";
import { getAmountStyle } from "@cocalc/util/db-schema/purchases";
import { describeQuotaFromInfo } from "@cocalc/util/licenses/describe-quota";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import {
  capitalize,
  field_cmp,
  currency,
  plural,
  round1,
  round2down,
  round4,
} from "@cocalc/util/misc";
import { decimalAdd } from "@cocalc/util/stripe/calc";
import AdminRefund from "./admin-refund";
import * as api from "./api";
import EmailStatement from "./email-statement";
import Export from "./export";
import DynamicallyUpdatingCost from "./pay-as-you-go/dynamically-updating-cost";
import Refresh from "./refresh";
import ServiceTag from "./service";
import { LineItemsButton } from "./line-items";
import { describeNumberOf, SectionDivider } from "./util";
import PurchasesPlot from "./purchases-plot";

const DEFAULT_LIMIT = 10;

interface Props {
  project_id?: string; // if given, restrict to only purchases that are for things in this project
  group?: boolean;
  day_statement_id?: number; // if given, restrict to purchases on this day statement.
  month_statement_id?: number; // if given, restrict to purchases on this month statement.
  account_id?: string; // used by admins to specify a different user
  noTitle?: boolean;
}

export default function Purchases(props: Props) {
  const is_commercial = useTypedRedux("customize", "is_commercial");
  if (!is_commercial) {
    return null;
  }
  return <Purchases0 {...props} />;
}

function Purchases0({
  project_id,
  group: group0,
  day_statement_id,
  month_statement_id,
  account_id,
  noTitle,
}: Props) {
  const [group, setGroup] = useState<boolean>(!!group0);

  return (
    <div>
      <Card
        title={
          noTitle ? undefined : (
            <>
              {account_id && (
                <Avatar
                  account_id={account_id}
                  style={{ marginRight: "15px" }}
                />
              )}
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
                  <Icon name="credit-card" /> Purchases
                </span>
              )}
            </>
          )
        }
      >
        <Flex>
          <div style={{ flex: 1 }} />
          <div>
            <Tooltip title="Aggregate transactions by service and project so you can see how much you are spending on each service in each project. Pay-as-you-go in progress purchases are not included.">
              <Checkbox
                checked={group}
                onChange={(e) => setGroup(e.target.checked)}
              >
                Group by service and project
              </Checkbox>
            </Tooltip>
          </div>
        </Flex>
        <PurchasesTable
          project_id={project_id}
          account_id={account_id}
          group={group}
          day_statement_id={day_statement_id}
          month_statement_id={month_statement_id}
          showBalance
          showTotal
        />
      </Card>
    </div>
  );
}

export function PurchasesTable({
  account_id,
  project_id,
  group,
  thisMonth,
  cutoff,
  day_statement_id,
  month_statement_id,
  noStatement,
  showBalance,
  showTotal,
  showRefresh,
  style,
  filename,
  activeOnly,
  refreshRef,
}: Props & {
  thisMonth?: boolean;
  cutoff?: Date;
  noStatement?: boolean;
  showBalance?: boolean;
  showTotal?: boolean;
  showRefresh?: boolean;
  style?: CSSProperties;
  filename?: string;
  activeOnly?: boolean;
  refreshRef?;
}) {
  const [loading, setLoading] = useState<boolean>(false);
  const [purchaseRecords, setPurchaseRecords] = useState<
    Partial<Purchase & { sum?: number }>[] | null
  >(null);
  const [purchases, setPurchases] = useState<
    Partial<Purchase & { sum?: number }>[] | null
  >(null);
  const [groupedPurchases, setGroupedPurchases] = useState<
    Partial<Purchase & { sum?: number }>[] | null
  >(null);
  const [error, setError] = useState<string>("");
  const [offset, setOffset] = useState<number>(0);
  const [total, setTotal] = useState<number | null>(null);
  const [service /*, setService*/] = useState<Service | undefined>(undefined);
  const [balance, setBalance] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true); // todo
  const [limit, setLimit] = useState<number>(DEFAULT_LIMIT);

  const getBalance = async () => {
    try {
      const userBalance = account_id
        ? await api.getBalanceAdmin(account_id)
        : await api.getBalance();

      setBalance(userBalance);
    } catch (err) {
      setError(`${err}`);
    }
  };

  const loadMore = async ({ init }: { init? } = {}) => {
    try {
      setError("");
      setLoading(true);

      let limit0;
      if (group) {
        limit0 = 300;
      } else {
        if (purchaseRecords == null) {
          limit0 = DEFAULT_LIMIT;
        } else if (init) {
          limit0 = Math.max(
            DEFAULT_LIMIT,
            Math.min(100, purchaseRecords.length),
          );
        } else {
          limit0 = limit;
        }
      }

      const opts = {
        cutoff,
        day_statement_id,
        month_statement_id,
        group,
        limit: limit0 + 1,
        no_statement: noStatement,
        offset: init ? 0 : offset,
        project_id,
        service,
        thisMonth,
      };
      let x = account_id
        ? await api.getPurchasesAdmin({ ...opts, account_id })
        : await api.getPurchases(opts);

      // TODO: need getPurchases to tell if there are more or not.
      setHasMore(x.length == limit0 + 1);
      x = x.slice(0, limit0);

      if (init) {
        setPurchaseRecords(x);
        setOffset(DEFAULT_LIMIT);
      } else {
        const v: { [id: string]: any } = {};
        for (const z of (purchaseRecords ?? []).concat(x)) {
          v[(z as any).id] = z;
        }
        const v2 = Object.values(v);
        v2.sort(field_cmp("id"));
        v2.reverse();
        // for next time:
        setOffset(v2.length);
        setPurchaseRecords(v2);
      }
      setLimit(100);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  const refreshRecords = async () => {
    // [ ] TODO: this needs to instead get only recent records (that could have possibly
    // changed or been added) and update them.
    await loadMore({ init: true });
    await getBalance();
  };
  if (refreshRef != null) {
    refreshRef.current = refreshRecords;
  }

  useEffect(() => {
    loadMore({ init: true });
    getBalance();
  }, []);

  useEffect(() => {
    refreshRecords();
  }, [group, noStatement, project_id, service, thisMonth]);

  useEffect(() => {
    if (purchaseRecords == null) {
      return;
    }

    setTotal(null);

    let b = balance;
    let t = 0;
    const purchases: Partial<Purchase & { balance: number }>[] = [];
    for (const row of purchaseRecords) {
      if (activeOnly && row.cost != null) {
        continue;
      }
      const cost = getCost(row);
      // Compute incremental balance
      purchases.push({ ...row, balance: b });

      if (row.pending) {
        // pending transactions are not include in the total
        // or the balance
        continue;
      }
      b = decimalAdd(b, cost);

      // Compute total cost
      t = decimalAdd(t, cost);
    }

    if (group) {
      purchases.sort(field_cmp("service"));
      setGroupedPurchases(purchases);
    } else {
      setPurchases(purchases);
    }
    setTotal(t);
  }, [balance, purchaseRecords, activeOnly]);

  //const download = (format: "csv" | "json") => {};

  return (
    <div style={style}>
      <SectionDivider
        loading={loading}
        onRefresh={() => loadMore({ init: true })}
      >
        <Tooltip title="These are transactions made within CoCalc, which includes all purchases and credits resulting from payments.">
          {group
            ? "Your Purchases Grouped by Service and Project"
            : describeNumberOf({
                n: purchases?.length,
                hasMore,
                loadMore,
                loading,
                type: "purchase",
              })}
        </Tooltip>
      </SectionDivider>
      <div>
        <ShowError error={error} setError={setError} />
        <div style={{ display: "flex" }}>
          <div style={{ flex: 1 }} />
          <Export
            style={{ margin: "-8px" }}
            name={
              filename ??
              getFilename({ thisMonth, cutoff, limit, offset, noStatement })
            }
            data={purchases}
          />
          {showRefresh && (
            <Refresh
              handleRefresh={refreshRecords}
              style={{ marginRight: "8px" }}
            />
          )}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        {(day_statement_id != null || month_statement_id != null) && (
          <EmailStatement
            style={{ marginLeft: "8px" }}
            statement_id={(day_statement_id ?? month_statement_id) as number}
          />
        )}
      </div>
      <div style={{ textAlign: "center", marginTop: "15px" }}>
        {group ? (
          <GroupedPurchaseTable purchases={groupedPurchases} />
        ) : (
          <DetailedPurchaseTable purchases={purchases} admin={!!account_id} />
        )}
      </div>
      <div
        style={{
          fontSize: "12pt",
          marginTop: "15px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {showTotal && total != null && (
          <span>Total of Displayed Costs: {currency(-total)}</span>
        )}
        {showBalance && balance != null && (
          <span>Current Balance: {currency(round2down(balance))}</span>
        )}
      </div>
      {!group && purchases != null && <PurchasesPlot purchases={purchases} />}
    </div>
  );
}

function GroupedPurchaseTable({ purchases }) {
  if (purchases == null) {
    return <Spin size="large" />;
  }
  return (
    <div style={{ overflow: "auto" }}>
      <div style={{ minWidth: "600px" }}>
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
              title: "Amount (USD)",
              dataIndex: "cost",
              key: "cost",
              align: "right" as "right",
              render: (cost) => <Amount record={{ cost }} />,
              sorter: (a: any, b: any) => (a.cost ?? 0) - (b.cost ?? 0),
              sortDirections: ["ascend", "descend"],
            },

            {
              title: "Items",
              dataIndex: "count",
              key: "count",
              align: "center" as "center",
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
          ]}
        />
      </div>
    </div>
  );
}

function DetailedPurchaseTable({
  purchases,
  admin,
}: {
  purchases: Partial<Purchase & { balance?: number }>[] | null;
  admin: boolean;
}) {
  if (purchases == null) {
    return <Spin size="large" />;
  }
  return (
    <div style={{ overflow: "auto" }}>
      <div style={{ minWidth: "1000px" }}>
        <Table
          scroll={{ y: 400 }}
          pagination={false}
          dataSource={purchases}
          rowKey="id"
          columns={[
            {
              width: "100px",
              title: "Id",
              dataIndex: "id",
              key: "id",
              sorter: (a, b) => (a.id ?? 0) - (b.id ?? 0),
              sortDirections: ["ascend", "descend"],
            },
            {
              title: "Description",
              dataIndex: "description",
              key: "description",
              width: "35%",
              render: (
                _,
                { id, description, invoice_id, notes, period_end, service },
              ) => (
                <div>
                  <Description
                    service={service}
                    description={description}
                    period_end={period_end}
                  />
                  <Flex wrap style={{ marginLeft: "-8px" }}>
                    {description?.["line_items"] != null && (
                      <LineItemsButton
                        lineItems={description["line_items"]}
                        style={{ marginBottom: "15px" }}
                      />
                    )}
                    {invoice_id && (
                      <Space>
                        {admin && id != null && (
                          <AdminRefund purchase_id={id} />
                        )}
                        {!admin && (
                          <Button
                            size="small"
                            type="link"
                            target="_blank"
                            href={getSupportURL({
                              body: `I would like to request a full refund for transaction ${id}.\n\nEXPLAIN WHAT HAPPENED.  THANKS!`,
                              subject: `Refund Request: Transaction ${id}`,
                              type: "purchase",
                              hideExtra: true,
                            })}
                          >
                            <Icon name="external-link" /> Refund
                          </Button>
                        )}
                        <InvoiceLink invoice_id={invoice_id} />
                      </Space>
                    )}
                  </Flex>
                  {notes && (
                    <StaticMarkdown
                      style={{ marginTop: "8px" }}
                      value={`**Notes:** ${notes}`}
                    />
                  )}
                </div>
              ),
            },
            {
              title: "Time",
              dataIndex: "time",
              key: "time",
              render: (text) => {
                return <TimeAgo date={text} />;
              },
              sorter: (a, b) =>
                new Date(a.time ?? 0).getTime() -
                new Date(b.time ?? 0).getTime(),
              sortDirections: ["ascend", "descend"],
            },
            {
              title: "Period",
              dataIndex: "period_start",
              key: "period",
              render: (_, record) => (
                <>
                  <Active record={record} />
                  <Period record={record} />
                </>
              ),
              sorter: (a, b) =>
                new Date(a.period_start ?? 0).getTime() -
                new Date(b.period_start ?? 0).getTime(),
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
              title: "Service",
              dataIndex: "service",
              key: "service",
              sorter: (a, b) =>
                (a.service ?? "").localeCompare(b.service ?? ""),
              sortDirections: ["ascend", "descend"],
              render: (service) => <ServiceTag service={service} />,
            },
            {
              title: "Amount (USD)",
              align: "right" as "right",
              dataIndex: "cost",
              key: "cost",
              render: (_, record) => (
                <>
                  <Amount record={record} />
                  <Pending record={record} />
                </>
              ),
              sorter: (a, b) => (a.cost ?? 0) - (b.cost ?? 0),
              sortDirections: ["ascend", "descend"],
            },
            {
              title: "Balance (USD)",
              align: "right" as "right",
              dataIndex: "balance",
              key: "balance",
              render: (_, { balance }) =>
                balance != undefined ? <Balance balance={balance} /> : null,
            },
          ]}
        />
      </div>
    </div>
  );
}

// "credit" | "openai-gpt-4" | "project-upgrade" | "license" | "edit-license", etc.

function Description({ description, period_end, service }) {
  if (description == null) {
    return null;
  }

  if (typeof service !== "string") {
    // service should be DescriptionType["type"]
    return null;
  }

  if (service.startsWith("openai-gpt-")) {
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
        {QUOTA_SPEC[service].display ?? service}
      </Tooltip>
    );
  }

  if (
    service.startsWith(MISTRAL_PREFIX) ||
    service.startsWith(ANTHROPIC_PREFIX) ||
    service.startsWith(GOOGLE_PREFIX)
  ) {
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
        {LLM_USERNAMES[service2model(service)] ?? service}
      </Tooltip>
    );
  }

  // <pre>{JSON.stringify(description, undefined, 2)}</pre>
  if (service === "license") {
    const { license_id } = description;
    return (
      <Popover
        overlayStyle={{
          maxHeight: "60vh",
          overflow: "auto",
          border: "1px solid #ccc",
          borderRadius: "5px",
          boxShadow: "4px 4px 2px #dfdfdf",
        }}
        title={
          <>
            Licenses:{" "}
            {license_id && (
              <Next href={`licenses/how-used?license_id=${license_id}`}>
                {license_id}
              </Next>
            )}
          </>
        }
        content={() => <>{license_id && <License license_id={license_id} />}</>}
      >
        License:{" "}
        {license_id && (
          <Next href={`licenses/how-used?license_id=${license_id}`}>
            {license_id}
          </Next>
        )}
      </Popover>
    );
  }
  if (service === "credit") {
    return (
      <Space>
        <Tooltip title="Thank you!">
          {description?.description ?? "Credit"}
          {description.voucher_code ? (
            <>
              {" "}
              For voucher <Tag>{description.voucher_code}</Tag>
            </>
          ) : (
            ""
          )}
        </Tooltip>
      </Space>
    );
  }
  if (service === "refund") {
    const { notes, reason, purchase_id } = description;
    return (
      <Tooltip
        title={
          <div>
            Reason: {capitalize(reason.replace(/_/g, " "))}
            {!!notes && (
              <>
                <br />
                Notes: {notes}
              </>
            )}
          </div>
        }
      >
        Refund Transaction {purchase_id}
      </Tooltip>
    );
  }

  if (service === "project-upgrade") {
    const quota = description?.quota ?? {};
    return (
      <>
        Project upgraded with <DisplayProjectQuota quota={quota} />
      </>
    );
  }

  if (service === "compute-server") {
    return (
      <ComputeServerDescription
        description={description}
        period_end={period_end}
      />
    );
  }

  if (service === "compute-server-network-usage") {
    return (
      <ComputeServerNetworkUsageDescription
        description={description}
        period_end={period_end}
      />
    );
  }

  if (service === "compute-server-storage") {
    return (
      <ComputeServerStorageDescription
        description={description}
        period_end={period_end}
      />
    );
  }

  if (service === "voucher") {
    const { title, quantity, voucher_id } = description;
    return (
      <div>
        <Next href={`vouchers/${voucher_id}`}>
          {quantity} {plural(quantity, "voucher")}: {title}
        </Next>
      </div>
    );
  }
  if (service === "edit-license") {
    const { license_id } = description;
    return (
      <Popover
        title={
          <div style={{ fontSize: "13pt" }}>
            <Icon name="pencil" /> Edited License:{" "}
            <Next href={`licenses/how-used?license_id=${license_id}`}>
              {license_id}
            </Next>
          </div>
        }
        content={() => (
          <div style={{ width: "500px" }}>
            <b>From:</b> {describeQuotaFromInfo(description.origInfo)}{" "}
            <LicenseDates info={description.origInfo} />
            <br />
            <br />
            <b>To:</b> {describeQuotaFromInfo(description.modifiedInfo)}{" "}
            <LicenseDates info={description.modifiedInfo} />
            {description.note != null && (
              <div>
                <br />
                NOTE: {description.note}
              </div>
            )}
          </div>
        )}
      >
        {describeQuotaFromInfo(description.modifiedInfo)}{" "}
        <LicenseDates info={description.modifiedInfo} />
      </Popover>
    );
  }
  // generic fallback...
  return (
    <>
      <Popover
        title={() => <pre>{JSON.stringify(description, undefined, 2)}</pre>}
      >
        {capitalize(service)}
      </Popover>
    </>
  );
}

function LicenseDates({ info }: { info: PurchaseInfo }) {
  if (info.type == "vouchers") {
    return null;
  }
  return (
    <span>
      (<TimeAgo date={info.start} /> to{" "}
      {info.end ? <TimeAgo date={info.end} /> : "-"})
    </span>
  );
}

/*
{
  "type": "edit-license",
  "origInfo": {
    "end": "2023-07-04T06:59:59.999Z",
    "type": "vm",
    "start": "2023-06-29T07:00:00.000Z",
    "quantity": 1,
    "account_id": "8e138678-9264-431c-8dc6-5c4f6efe66d8",
    "dedicated_vm": {
      "machine": "n2-highmem-8"
    },
    "subscription": "no"
  },
  "license_id": "0b7b03a4-d13a-4187-b907-0cae6f591f8a",
  "modifiedInfo": {
    "end": "2023-07-07T06:59:59.999Z",
    "type": "vm",
    "start": "2023-06-30T23:29:22.413Z",
    "quantity": 1,
    "account_id": "8e138678-9264-431c-8dc6-5c4f6efe66d8",
    "dedicated_vm": {
      "machine": "n2-highmem-8"
    },
    "subscription": "no"
  }
}
*/

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

function InvoiceLink({ invoice_id }) {
  const [loading, setLoading] = useState<boolean>(false);
  const [unknown, setUnknown] = useState<boolean>(false);
  return (
    <Button
      size="small"
      disabled={unknown}
      type="link"
      onClick={async () => {
        try {
          setLoading(true);
          const invoiceUrl = await api.getInvoiceUrl(invoice_id);
          if (invoiceUrl) {
            open_new_tab(invoiceUrl, false);
          } else {
            setUnknown(true);
          }
        } finally {
          setLoading(false);
        }
      }}
    >
      <Icon name="external-link" /> Receipt{" "}
      {unknown ? " (ERROR: receipt not found)" : ""}
      {loading && <Spin style={{ marginLeft: "30px" }} />}
    </Button>
  );
}

function Amount({ record }) {
  const { cost } = record;
  if (cost == null) {
    // it's a partial ongoing purchase
    if (record.period_start && record.cost_per_hour) {
      // it's a pay-as-you-go purchase with a fixed rate
      return (
        <DynamicallyUpdatingCost
          costPerHour={record.cost_per_hour}
          start={new Date(record.period_start).valueOf()}
        />
      );
    } else if (record.period_start && record.cost_so_far != null) {
      const amount = -record.cost_so_far;
      // it's a metered pay as you go purchase
      return <span style={getAmountStyle(amount)}>{currency(amount, 2)}</span>;
    }
  }
  if (cost != null) {
    const amount = -cost;
    return (
      <Tooltip title={` (USD): ${currency(round4(amount), 4)}`}>
        <span
          style={{
            ...getAmountStyle(amount),
            ...(record.pending ? { color: "#999" } : undefined),
          }}
        >
          {currency(amount, 2)}
        </span>
      </Tooltip>
    );
  }
  return <>-</>;
}

function Pending({ record }) {
  if (!record.pending) return null;
  return (
    <div>
      <Tooltip
        title={
          <>
            The transaction has not yet completed and is{" "}
            <b>thus not included in your running balance</b>. Ensure you have
            automatic payments configured or add credit to your account to pay
            this.
          </>
        }
      >
        <Tag style={{ marginRight: 0 }} color="red">
          Pending
        </Tag>
      </Tooltip>
    </div>
  );
}

function Balance({ balance }) {
  if (balance != null) {
    return (
      <Tooltip title={` (USD): ${currency(round4(balance), 4)}`}>
        <span style={getAmountStyle(balance)}>
          {currency(round2down(balance), 2)}
        </span>
      </Tooltip>
    );
  }
  return <>-</>;
}

function getFilename({ thisMonth, cutoff, limit, offset, noStatement }) {
  const v: string[] = [];
  if (thisMonth) {
    v.push("since_last_statement");
  }
  if (noStatement) {
    v.push("not_on_statement");
  }
  if (cutoff) {
    v.push(new Date(cutoff).toISOString().split("T")[0]);
  }
  if (limit) {
    v.push(`limit${limit}`);
  }
  if (offset) {
    v.push(`offset${offset}`);
  }
  return v.join("-");
}

export function PurchasesButton(props: Props) {
  const [show, setShow] = useState<boolean>(false);
  return (
    <div>
      <Button onClick={() => setShow(!show)}>
        <Icon name="table" /> Purchases
      </Button>
      {show && (
        <div style={{ marginTop: "8px" }}>
          <Purchases {...props} />
        </div>
      )}
    </div>
  );
}

// this should match with sql formula in server/purchases/get-balance.ts
function getCost(row: Partial<Purchase>) {
  if (row.cost != null) {
    return row.cost;
  }
  if (row.cost_so_far != null) {
    return row.cost_so_far;
  }
  if (row.cost_per_hour != null && row.period_start != null) {
    const hours = periodLengthInHours(row);
    return row.cost_per_hour * hours;
  }
  return 0;
}

// start = end = iso time strings
// if end not given, assumed now
function periodLengthInHours({
  period_start,
  period_end,
}: {
  period_start?: Date;
  period_end?: Date;
}) {
  if (period_start == null) {
    return 0;
  }
  const end = period_end != null ? period_end.valueOf() : Date.now();
  const start = period_start.valueOf();
  const ms = end - start;
  const hours = ms / (1000 * 3600);
  return hours;
}

function Active({ record }) {
  const { cost } = record;
  if (cost != null) {
    return null; // not active
  }
  // it's a partial ongoing purchase
  if (record.period_start && record.cost_per_hour != null) {
    // it's a pay-as-you-go purchase with a fixed rate
    return (
      <Tooltip
        title={`This is an active purchase at a rate of ${currency(
          record.cost_per_hour,
        )}/hour. Active purchases are finalized within a day.`}
      >
        <Tag color="green" style={{ margin: 0 }}>
          Active
        </Tag>
      </Tooltip>
    );
  } else if (record.period_start && record.cost_so_far != null) {
    // it's a metered pay as you go purchase
    return (
      <Tooltip
        title={`This is an active metered purchase. Active purchases are finalized within a day.`}
      >
        <Tag color="green" style={{ margin: 0 }}>
          Active
        </Tag>
      </Tooltip>
    );
  }
  return null;
}

function Period({ record }) {
  if (record.period_start) {
    const hours = periodLengthInHours(record);
    const x = (
      <div style={{ borderTop: "1px solid #ccc" }}>{round1(hours)} hours</div>
    );
    if (!record.period_end) {
      return (
        <div>
          <TimeAgo date={record.period_start} /> - now
          {x}
        </div>
      );
    } else {
      return (
        <div>
          <TimeAgo date={record.period_start} /> -{" "}
          <TimeAgo date={record.period_end} />
          {x}
        </div>
      );
    }
  }
  return null;
}
