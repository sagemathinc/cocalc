import { CSSProperties, useEffect, useState } from "react";
import {
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
import * as api from "./api";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import type { Purchase, Description } from "@cocalc/util/db-schema/purchases";
import { getAmountStyle } from "@cocalc/util/db-schema/purchases";
import { ProjectTitle } from "@cocalc/frontend/projects/project-title";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";
import ServiceTag from "./service";
import { capitalize, plural } from "@cocalc/util/misc";
import { SiteLicensePublicInfo as License } from "@cocalc/frontend/site-licenses/site-license-public-info-component";
import Next from "@cocalc/frontend/components/next";
import { open_new_tab } from "@cocalc/frontend/misc/open-browser-tab";
import { currency } from "@cocalc/util/misc";
import DynamicallyUpdatingCost from "./pay-as-you-go/dynamically-updating-cost";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import { load_target } from "@cocalc/frontend/history";
import { describeQuotaFromInfo } from "@cocalc/util/licenses/describe-quota";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import Refresh from "@cocalc/frontend/components/refresh";
import ShowError from "@cocalc/frontend/components/error";
import Export from "./export";
import EmailStatement from "./email-statement";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import AdminRefund from "./admin-refund";
import { A } from "@cocalc/frontend/components/A";
import getSupportURL from "@cocalc/frontend/support/url";

const DEFAULT_LIMIT = 150;

interface Props {
  project_id?: string; // if given, restrict to only purchases that are for things in this project
  group?: boolean;
  day_statement_id?: number; // if given, restrict to purchases on this day statement.
  month_statement_id?: number; // if given, restrict to purchases on this month statement.
  account_id?: string; // used by admins to specify a different user
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
}: Props) {
  const [group, setGroup] = useState<boolean>(!!group0);
  const [thisMonth, setThisMonth] = useState<boolean>(true);
  const [noStatement, setNoStatement] = useState<boolean>(false);

  return (
    <SettingBox
      title={
        <>
          {account_id && (
            <Avatar account_id={account_id} style={{ marginRight: "15px" }} />
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
              <Icon name="table" /> Transactions
            </span>
          )}
        </>
      }
    >
      <div style={{ float: "right" }}>
        <Tooltip title="Aggregate transactions by service and project so you can see how much you are spending on each service in each project. Pay-as-you-go in progress purchases are not included.">
          <Checkbox
            checked={group}
            onChange={(e) => setGroup(e.target.checked)}
          >
            Group by service and project
          </Checkbox>
        </Tooltip>
        <Tooltip title="Only show transactions from your current billing month.">
          <Checkbox
            checked={thisMonth}
            onChange={(e) => setThisMonth(e.target.checked)}
          >
            Current billing month
          </Checkbox>
        </Tooltip>
        <Tooltip title="Only show transactions that are not on any daily or monthly statement. These should all be from today.">
          <Checkbox
            checked={noStatement}
            onChange={(e) => setNoStatement(e.target.checked)}
          >
            Not on any statement yet
          </Checkbox>
        </Tooltip>
      </div>
      <PurchasesTable
        project_id={project_id}
        account_id={account_id}
        group={group}
        thisMonth={thisMonth}
        day_statement_id={day_statement_id}
        month_statement_id={month_statement_id}
        noStatement={noStatement}
        showTotal
        showRefresh
      />
    </SettingBox>
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
  showTotal,
  showRefresh,
  style,
  limit = DEFAULT_LIMIT,
  filename,
}: Props & {
  thisMonth?: boolean;
  cutoff?: Date;
  noStatement?: boolean;
  showTotal?: boolean;
  showRefresh?: boolean;
  style?: CSSProperties;
  limit?: number;
  filename?: string;
}) {
  const [purchases, setPurchases] = useState<Partial<Purchase>[] | null>(null);
  const [groupedPurchases, setGroupedPurchases] = useState<
    Partial<Purchase>[] | null
  >(null);
  const [error, setError] = useState<string>("");
  const [offset, setOffset] = useState<number>(0);
  const [total, setTotal] = useState<number | null>(null);
  const [service /*, setService*/] = useState<Service | undefined>(undefined);

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
      setGroupedPurchases(null);
      const opts = {
        thisMonth,
        cutoff,
        limit,
        offset,
        group,
        service,
        project_id,
        day_statement_id,
        month_statement_id,
        no_statement: noStatement,
      };
      const x = account_id
        ? await api.getPurchasesAdmin({ ...opts, account_id })
        : await api.getPurchases(opts);
      if (group) {
        setGroupedPurchases(x);
      } else {
        setPurchases(x);
      }
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
  }, [limit, offset, group, service, project_id, thisMonth, noStatement]);

  //const download = (format: "csv" | "json") => {};

  return (
    <div style={style}>
      {showRefresh && <Refresh refresh={getPurchases} />}
      <ShowError error={error} setError={setError} />
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
        }}
      >
        {purchases &&
          !thisMonth &&
          purchases.length > 0 &&
          (purchases.length >= limit || offset > 0) && (
            <div style={{ marginRight: "10px" }}>
              Page {Math.floor(offset / limit) + 1}
            </div>
          )}
        {!thisMonth && offset > 0 && (
          <Button
            type="default"
            onClick={getPrevPage}
            style={{ marginRight: "8px" }}
          >
            Previous
          </Button>
        )}
        {!thisMonth && purchases && purchases.length >= limit && (
          <Button type="default" onClick={getNextPage}>
            Next
          </Button>
        )}
        <Export
          style={{ marginLeft: "8px" }}
          name={
            filename ??
            getFilename({ thisMonth, cutoff, limit, offset, noStatement })
          }
          data={purchases}
        />
        {(day_statement_id != null || month_statement_id != null) && (
          <EmailStatement
            style={{ marginLeft: "8px" }}
            statement_id={(day_statement_id ?? month_statement_id) as number}
          />
        )}
      </div>
      <div style={{ textAlign: "center", marginTop: "15px" }}>
        {!group && (
          <DetailedPurchaseTable purchases={purchases} admin={!!account_id} />
        )}
        {group && <GroupedPurchaseTable purchases={groupedPurchases} />}
      </div>
      {showTotal && total != null && (
        <div style={{ fontSize: "12pt", marginTop: "15px" }}>
          Total of Displayed Costs: ${total.toFixed(2)}
        </div>
      )}
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
              dataIndex: "sum",
              key: "sum",
              align: "right" as "right",
              render: (amount) => <Amount record={{ cost: amount }} />,
              sorter: (a: any, b: any) => (a.sum ?? 0) - (b.sum ?? 0),
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
  purchases: Partial<Purchase>[] | null;
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
            },
            {
              title: "Description",
              dataIndex: "description",
              key: "description",
              width: "35%",
              render: (_, { id, description, invoice_id, notes }) => (
                <div>
                  <Description description={description} />
                  {invoice_id && (
                    <div
                      style={{ marginLeft: "15px", display: "inline-block" }}
                    >
                      {admin && id != null && <AdminRefund purchase_id={id} />}
                      {!admin && (
                        <A
                          href={getSupportURL({
                            body: `I would like to request a full refund for transaction ${id}.\n\nEXPLAIN WHAT HAPPENED.  THANKS!`,
                            subject: `Refund Request: Transaction ${id}`,
                            type: "purchase",
                            hideExtra: true,
                          })}
                        >
                          <Icon name="external-link" /> Refund
                        </A>
                      )}
                      <InvoiceLink invoice_id={invoice_id} />
                    </div>
                  )}
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
              render: (text, record) => {
                if (record.service == "project-upgrade") {
                  let minutes;
                  if (
                    record.description?.type == "project-upgrade" &&
                    record.description.stop != null &&
                    record.description.start != null
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
                      {record.description?.type == "project-upgrade" &&
                      record.description.stop != null ? (
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
      </div>
    </div>
  );
}

// "credit" | "openai-gpt-4" | "project-upgrade" | "license" | "edit-license"

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
    const { license_id } = description;
    return (
      <Popover
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
  if (description.type == "credit") {
    return (
      <Space>
        <Tooltip title="Thank you!">
          Credit{" "}
          {description.voucher_code ? (
            <>
              from voucher <Tag>{description.voucher_code}</Tag>
            </>
          ) : (
            ""
          )}
        </Tooltip>
      </Space>
    );
  }
  if (description.type == "refund") {
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

  if (description.type == "project-upgrade") {
    const quota = description?.quota ?? {};
    return <DisplayProjectQuota quota={quota} />;
  }
  if (description.type == "voucher") {
    const { title, quantity, voucher_id } = description;
    return (
      <div>
        <Next href={`vouchers/${voucher_id}`}>
          {quantity} {plural(quantity, "voucher")}: {title}
        </Next>
      </div>
    );
  }
  if (description.type == "edit-license") {
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
        {capitalize(description.type)}
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
  if (
    cost == null &&
    record.period_start != null &&
    record.cost_per_hour != null
  ) {
    return (
      <Space>
        <DynamicallyUpdatingCost
          costPerHour={record.cost_per_hour}
          start={new Date(record.period_start).valueOf()}
        />
        <Tag color="green">Active</Tag>
      </Space>
    );
  }
  if (cost != null) {
    const amount = -cost;
    return (
      <span style={getAmountStyle(amount)}>
        {currency(amount, Math.abs(amount) < 0.1 ? 3 : 2)}
      </span>
    );
  }
  return <>-</>;
}

function Pending({ record }) {
  if (!record.pending) return null;
  return (
    <div>
      <Tooltip title="The transaction does not yet count against your spending limits.">
        <Tag style={{ marginRight: 0 }} color="red">
          Pending
        </Tag>
      </Tooltip>
    </div>
  );
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
        <Icon name="table" /> Transactions...
      </Button>
      {show && (
        <div style={{ marginTop: "8px" }}>
          <Purchases {...props} />
        </div>
      )}
    </div>
  );
}
