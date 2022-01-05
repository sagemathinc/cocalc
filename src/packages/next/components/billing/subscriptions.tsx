import { useState } from "react";
import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import A from "components/misc/A";
import Timestamp from "components/misc/timestamp";
import { Alert, Button, Popconfirm, Table } from "antd";
import { capitalize, cmp, stripeAmount, planInterval } from "@cocalc/util/misc";
import HelpEmail from "components/misc/help-email";
import { Icon } from "@cocalc/frontend/components/icon";
import License from "components/licenses/license";
import useIsMounted from "lib/hooks/mounted";
import apiPost from "lib/api/post";

function Description({ latest_invoice, metadata, invoices }) {
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
        {metadata?.license_id && (
          <div>
            License: <License license_id={metadata?.license_id} />
          </div>
        )}
      </div>
    );
  }
  return null;
}

function Period({
  current_period_start,
  current_period_end,
  cancel_at_period_end,
}) {
  return (
    <>
      <Timestamp epoch={1000 * current_period_start} dateOnly absolute /> –{" "}
      <Timestamp epoch={1000 * current_period_end} dateOnly absolute />
      {cancel_at_period_end && (
        <span>
          <br />
          (will cancel at period end)
        </span>
      )}
    </>
  );
}

function Status({ status }) {
  return <>{capitalize(status)}</>;
}

function Cost({ plan }) {
  return (
    <>
      {stripeAmount(plan.amount, plan.currency)} for{" "}
      {planInterval(plan.interval, plan.interval_count)}
    </>
  );
}

function Cancel({ cancel_at_period_end, id, onChange }) {
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
            <b>cancel this subscription at period end</b>? If you cancel your
            subscription, it will run to the end of the subscription period, but
            will not be renewed when the current (already paid for) period ends.
            If you need further clarification or need a refund,{" "}
            <HelpEmail lower />.
          </div>
        }
        onConfirm={async () => {
          setCancelling(true);
          setError("");
          try {
            await apiPost("billing/cancel-subscription", { id });
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
        <Button disabled={cancel_at_period_end || cancelling} type="dashed">
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
}

function columns(invoices, onChange) {
  return [
    {
      responsive: ["xs"],
      title: "Subscriptions",
      render: (_, sub) => (
        <div>
          <Description {...sub} invoices={invoices} />
          Status: <Status {...sub} />
          <br />
          Period: <Period {...sub} />
          <br />
          Cost: <Cost {...sub} />
          <br />
          <Cancel {...sub} onChange={onChange} />
        </div>
      ),
    },
    {
      responsive: ["sm"],
      title: "Description",
      width: "50%",
      render: (_, sub) => <Description {...sub} invoices={invoices} />,
    },
    {
      responsive: ["sm"],
      title: "Status",
      align: "center" as "center",
      render: (_, sub) => <Status {...sub} />,
      sorter: { compare: (a, b) => cmp(a.status, b.status) },
    },
    {
      responsive: ["sm"],
      title: "Period",
      align: "center" as "center",
      render: (_, sub) => <Period {...sub} />,
    },
    {
      responsive: ["sm"],
      title: "Cost",
      sorter: { compare: (a, b) => cmp(a.plan.amount, b.plan.amount) },
      render: (_, sub) => <Cost {...sub} />,
    },
    {
      responsive: ["sm"],
      title: "Cancel",
      align: "center" as "center",
      render: (_, sub) => <Cancel {...sub} onChange={onChange} />,
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
      <h3>Your Subscriptions ({subscriptions.result?.data?.length ?? 0})</h3>
      <div style={{ maxWidth: "800px", margin: "15px 0" }}>
        Your subscriptions are listed below. You can view invoices, get
        information about the license or plan corresponding to a subscription,
        and cancel a subscription at period end. You can also{" "}
        <A href="/store/site-license">create a new site license subscription</A>
        . If you have any questions <HelpEmail lower />.
      </div>
      <Table
        columns={columns(invoices.result, onChange) as any}
        dataSource={subscriptions.result?.data ?? []}
        rowKey={"id"}
        pagination={{ hideOnSinglePage: true, pageSize: 100 }}
        style={{ overflowX: "scroll" }}
      />
      {subscriptions.result?.has_more && (
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
