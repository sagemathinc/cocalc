import { useState } from "react";
import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import A from "components/misc/A";
import Timestamp from "components/misc/timestamp";
import { Alert, Button, Popconfirm, Table } from "antd";
import { capitalize, stripeAmount, planInterval } from "@cocalc/util/misc";
import HelpEmail from "components/misc/help-email";
import { Icon } from "@cocalc/frontend/components/icon";
import License from "components/licenses/license";
import useIsMounted from "lib/hooks/mounted";
import apiPost from "lib/api/post";

function columns(invoices, onChange) {
  return [
    {
      title: "Description",
      width: "50%",
      dataIndex: "latest_invoice",
      render: (latest_invoice, record) => {
        for (const invoice of invoices.data) {
          if (latest_invoice != invoice.id) continue;
          const cnt = invoice.lines?.total_count ?? 1;
          const url = invoice.hosted_invoice_url;
          return (
            <div style={{ wordWrap: "break-word", wordBreak: "break-word" }}>
              {invoice.lines.data[0].description}
              {cnt > 1 && ", etc."}
              {url && (
                <div>
                  <A href={url}>
                    <Icon name="external-link" /> Invoice
                  </A>
                </div>
              )}
              {record.metadata?.license_id && (
                <div>
                  License: <License license_id={record.metadata?.license_id} />
                </div>
              )}
            </div>
          );
        }
        return null;
      },
    },
    {
      title: "Status",
      align: "center" as "center",
      dataIndex: "status",
      render: capitalize,
    },
    {
      title: "Period",
      align: "center" as "center",
      render: (
        _,
        { current_period_start, current_period_end, cancel_at_period_end }
      ) => (
        <>
          <Timestamp epoch={1000 * current_period_start} dateOnly /> –{" "}
          <Timestamp epoch={1000 * current_period_end} dateOnly />
          {cancel_at_period_end && <div>(will cancel at period end)</div>}
        </>
      ),
    },
    {
      title: "Cost",
      dataIndex: "plan",
      render: (plan) => (
        <>
          {stripeAmount(plan.amount, plan.currency)} for{" "}
          {planInterval(plan.interval, plan.interval_count)}
        </>
      ),
    },
    {
      title: "Cancel",
      align: "center" as "center",
      dataIndex: "cancel_at_period_end",
      render: (cancel_at_period_end, sub) => {
        const [error, setError] = useState<string>("");
        const [cancelling, setCancelling] = useState<boolean>(false);
        const isMounted = useIsMounted();
        return (
          <div>
            <Popconfirm
              placement="bottomLeft"
              title={
                <div style={{ maxWidth: "500px" }}>
                  Cancel? Are you sure you want to{" "}
                  <b>cancel this subscription at period end</b>? If you cancel
                  your subscription, it will run to the end of the subscription
                  period, but will not be renewed when the current (already paid
                  for) period ends. If you need further clarification or need a
                  refund, <HelpEmail lower />.
                </div>
              }
              onConfirm={async () => {
                setCancelling(true);
                setError("");
                try {
                  await apiPost("billing/cancel-subscription", { id: sub.id });
                } catch (err) {
                  if (!isMounted.current) return;
                  setError(err.message);
                } finally {
                  if (!isMounted.current) return;
                  setCancelling(false);
                  onChange();
                }
              }}
              okText="Yes, cancel at period end (do not auto-renew)"
              cancelText="Make no change"
            >
              <Button
                disabled={cancel_at_period_end || cancelling}
                type="dashed"
              >
                {cancelling ? (
                  <Loading delay={0}>Cancelling...</Loading>
                ) : (
                  `Cancel${cancel_at_period_end ? "led" : ""}`
                )}
              </Button>
              {error && (
                <Alert
                  style={{ marginTop: "15px" }}
                  type="error"
                  message={`Error: ${error}`}
                />
              )}
            </Popconfirm>
          </div>
        );
      },
    },
  ];
}

export default function Subscriptions() {
  const subscriptions = useAPI("billing/get-subscriptions");
  const invoices = useAPI("billing/get-invoices-and-receipts");
  if (subscriptions.error) {
    return <Alert type="error" message={subscriptions.error} />;
  }
  if (!subscriptions.result) {
    return <Loading />;
  }
  if (invoices.error) {
    return <Alert type="error" message={invoices.error} />;
  }
  if (!invoices.result) {
    return <Loading />;
  }

  function onChange() {
    subscriptions.call();
    invoices.call();
  }

  return (
    <div>
      <h3>Your Subscriptions ({subscriptions.result.data.length})</h3>
      <Table
        columns={columns(invoices.result, onChange)}
        dataSource={subscriptions.result.data}
        rowKey={"id"}
        pagination={{ hideOnSinglePage: true, pageSize: 100 }}
      />
      {subscriptions.result.has_more && (
        <Alert
          style={{ margin: "15px" }}
          type="warning"
          showIcon
          message="WARNING: Some of your subscriptions are not displayed above, since there are so many."
        />
      )}
    </div>
  );
}
