import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import { Alert, Table } from "antd";
import { cmp, stripeAmount } from "@cocalc/util/misc";
import License from "components/licenses/license";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import Timestamp from "components/misc/timestamp";

function Description({ hosted_invoice_url, lines, metadata }) {
  const license_id = metadata?.license_id ?? lines.data[0].metadata?.license_id;
  return (
    <div style={{ wordWrap: "break-word", wordBreak: "break-word" }}>
      {lines.data[0].description}
      {(lines?.total_count ?? 1) > 1 && ", etc."}
      {hosted_invoice_url && (
        <div>
          <A href={hosted_invoice_url}>
            <Icon name="external-link" /> Invoice
          </A>
        </div>
      )}
      {license_id && (
        <div>
          License: <License license_id={license_id} />
        </div>
      )}
    </div>
  );
}

function Status({ status, due_date, hosted_invoice_url }) {
  if (status == "paid") {
    return <>Paid</>;
  }
  return (
    <A style={{ color: "red" }} href={hosted_invoice_url}>
      <Icon name="external-link" /> Due{" "}
      <Timestamp epoch={1000 * due_date} dateOnly />
    </A>
  );
}

function Created({ created }) {
  return <Timestamp epoch={1000 * created} dateOnly />;
}

function Amount({ total, currency }) {
  return <>{stripeAmount(total, currency)}</>;
}

const columns = [
  {
    responsive: ["xs"],
    title: "Invoices and Receipts",
    render: (_, invoice) => (
      <div>
        <Description {...invoice} />
        Created: <Created {...invoice} />
        <br />
        <Amount {...invoice} />
        <br />
        <Status {...invoice} />
      </div>
    ),
  },
  {
    responsive: ["sm"],
    title: "Description",
    width: "50%",
    render: (_, invoice) => <Description {...invoice} />,
  },
  {
    responsive: ["sm"],
    title: "Status",
    align: "center" as "center",
    render: (_, invoice) => <Status {...invoice} />,
    sorter: { compare: (a, b) => cmp(a.status, b.status) },
  },
  {
    responsive: ["sm"],
    title: "Created",
    align: "center" as "center",
    render: (_, invoice) => <Created {...invoice} />,
    sorter: { compare: (a, b) => -cmp(a.created, b.created) },
  },
  {
    responsive: ["sm"],
    title: "Amount",
    align: "right",
    render: (_, invoice) => <Amount {...invoice} />,
    sorter: { compare: (a, b) => cmp(a.amount_paid ?? 0, b.amount_paid ?? 0) },
  },
];

export default function InvoicesAndReceipts() {
  const { result, error } = useAPI("billing/get-invoices-and-receipts");
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading />;
  }
  return (
    <div>
      <h3>Invoices and Receipts</h3>
      Your invoices and receipts are listed below. Click on the "Invoice" link
      to get a printable invoice or receipt version.
      <Table
        columns={columns as any}
        dataSource={result.data ?? []}
        rowKey={"id"}
        style={{ marginTop: "15px" }}
        pagination={{ hideOnSinglePage: true, pageSize: 100 }}
      />
    </div>
  );
}
