import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import { Alert, Table } from "antd";
import { cmp, stripeAmount } from "@cocalc/util/misc";
import License from "components/licenses/license";
import A from "components/misc/A";
import { Icon } from "@cocalc/frontend/components/icon";
import Timestamp from "components/misc/timestamp";

const columns = [
  {
    title: "Description",
    width: "50%",
    dataIndex: "hosted_invoice_url",
    render: (hosted_invoice_url, { lines }) => (
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
        {lines.data[0].metadata?.license_id && (
          <div>
            License: <License license_id={lines.data[0].metadata?.license_id} />
          </div>
        )}
      </div>
    ),
  },
  {
    title: "Status",
    align: "center" as "center",
    dataIndex: "status",
    render: (status, { due_date, hosted_invoice_url }) => {
      if (status == "paid") {
        return "Paid";
      }
      return (
        <A style={{ color: "red" }} href={hosted_invoice_url}>
          <Icon name="external-link" /> Due <Timestamp epoch={1000 * due_date} dateOnly />
        </A>
      );
    },
    sorter: { compare: (a, b) => cmp(a.status, b.status) },
  },
  {
    title: "Created",
    align: "center" as "center",
    dataIndex: "created",
    render: (created) => <Timestamp epoch={1000 * created} dateOnly />,
    sorter: { compare: (a, b) => -cmp(a.created, b.created) },
  },
  {
    title: "Amount",
    align: "right",
    dataIndex: "total",
    render: (total, { currency }) => <>{stripeAmount(total, currency)}</>,
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
  console.log(result);
  return (
    <div>
      <h3>Invoices and Receipts</h3>
      Your invoices and receipts are listed below. Click on the "Invoice" link
      to get a printable invoice or receipt version.
      <Table
        columns={columns as any}
        dataSource={result.data}
        rowKey={"id"}
        style={{ marginTop: "15px" }}
        pagination={{ hideOnSinglePage: true, pageSize: 100 }}
      />
    </div>
  );
}
