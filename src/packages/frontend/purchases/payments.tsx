import { useEffect, useRef, useState } from "react";
import {
  cancelPaymentIntent,
  getInvoice,
  getPaymentMethod,
  getPayments,
} from "./api";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Flex,
  Popconfirm,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "antd";
import { FinishStripePayment } from "./stripe-payment";
import { capitalize, replace_all, round2 } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { PAYMENT_INTENT_REASONS } from "@cocalc/util/stripe/types";
import { describeNumberOf, RawJson } from "./util";
import { PaymentMethod } from "./payment-methods";
import { decimalSubtract, stripeToDecimal } from "@cocalc/util/stripe/calc";
import { LineItemsTable, moneyToString } from "./line-items";
import dayjs from "dayjs";

const DEFAULT_LIMIT = 10;

interface Props {
  refresh?: Function;
  refreshPaymentsRef?;
  numPaymentsRef?;
  // if you are an admin and want to view a different user's incomplete payments
  account_id?: string;
  // default created input to api for first load
  created?;
  // load all unfinished payments (from last 30 days; I think after that it is too late) -- created is ignored
  unfinished?: boolean;
  // load all canceled payments (recent)
  canceled?: boolean;
  // if given, only show payments with the given purpose
  purpose?: string;
  limit?: number;
}

export default function Payments({
  refresh,
  refreshPaymentsRef,
  numPaymentsRef,
  account_id,
  created,
  unfinished,
  canceled,
  purpose,
  limit = DEFAULT_LIMIT,
}: Props) {
  const [error, setError] = useState<string>("");
  const [hasLoadedMore, setHasLoadedMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [data, setData] = useState<null | any[]>(null);
  const [hasMore, setHasMore] = useState<boolean | null>(null);
  const lastLoadRef = useRef<number>(0);

  const loadMore = async ({
    init,
    reset,
  }: { init?: boolean; reset?: boolean } = {}) => {
    const now = Date.now();
    if (now - lastLoadRef.current < 3000) {
      return;
    }
    lastLoadRef.current = now;
    try {
      setError("");
      setLoading(true);
      let result;
      let data0;
      if (init || data == null || reset) {
        result = await getPayments({
          user_account_id: account_id,
          limit: hasLoadedMore ? 100 : limit,
          created,
          unfinished,
          canceled,
        });
        data0 = result.data;
      } else {
        result = await getPayments({
          user_account_id: account_id,
          starting_after: data[data.length - 1].id,
          limit: 100,
        });
        data0 = data.concat(result.data);
        setHasLoadedMore(true);
      }
      if (purpose) {
        data0 = data0.filter((x) => x.metadata?.purpose == purpose);
      }
      setData(data0);
      if (numPaymentsRef != null) {
        numPaymentsRef.current = data0.length;
      }
      setHasMore(result.has_more);
      await refresh?.();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMore({ init: true, reset: true });
  }, [account_id]);

  if (refreshPaymentsRef != null) {
    refreshPaymentsRef.current = async () => {
      await loadMore({ init: true });
    };
  }

  return (
    <div>
      <Flex>
        <div style={{ flex: 1 }}>
          <Divider titlePlacement="start">
            <Tooltip title="These are payments to CoCalc from some outside source (your credit card, bank, etc.).">
              {describeNumberOf({
                n: data?.length,
                hasMore,
                loadMore,
                loading,
                type: "payment",
                adjective: unfinished
                  ? `Unfinished ${canceled ? "or Canceled" : ""}`
                  : canceled
                    ? "Canceled"
                    : "",
              })}
              {!!unfinished && (data?.length ?? 0) > 0 && (
                <Badge
                  count={data?.length}
                  style={{ backgroundColor: "red", marginLeft: "15px" }}
                />
              )}
            </Tooltip>
            {loading && <Spin style={{ marginLeft: "15px" }} />}
          </Divider>
        </div>
        <Button
          style={{ marginTop: "15px" }}
          type="link"
          onClick={() => {
            loadMore({ init: true });
          }}
        >
          <Icon name="refresh" /> Refresh
        </Button>
      </Flex>
      <div>
        <ShowError error={error} setError={setError} />
        {data?.length == 0 &&
          !hasMore &&
          (unfinished ? (
            <Alert showIcon type="success" message="All Payments Succeeded!" />
          ) : (
            <Alert showIcon type="info" message="No Payments" />
          ))}
        {data != null && data?.length > 0 && (
          <>
            <PaymentIntentsTable
              paymentIntents={data}
              onFinished={() => {
                loadMore({ init: true });
              }}
              account_id={account_id}
            />
            {/*<PaymentsPlot data={data} />*/}
          </>
        )}
      </div>
    </div>
  );
}

function PaymentIntentsTable({ paymentIntents, onFinished, account_id }) {
  const columns = [
    {
      title: "Credit Id",
      render: (_, { intent }) => <>{intent?.metadata?.credit_id}</>,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount, { intent }) => {
        return moneyToString(round2(amount / 100), intent.currency);
      },
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status, { intent }) => {
        if (intent.metadata.refund_date) {
          return (
            <Space direction="vertical" size="small">
              <div>
                <Tag>Refunded</Tag>{" "}
                <TimeAgo date={parseInt(intent.metadata.refund_date)} />
              </div>
              <Tag>{intent.metadata.refund_reason}</Tag>
              {!!intent.metadata.refund_notes && (
                <div>{intent.metadata.refund_notes}</div>
              )}
            </Space>
          );
        }
        // colors below are from https://docs.stripe.com/payments/paymentintents/lifecycle
        switch (status) {
          case "requires_payment_method":
            return (
              <div>
                <Icon
                  name="credit-card"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                <Tag
                  style={{
                    backgroundColor: "red",
                    color: "white",
                    whiteSpace: "normal",
                  }}
                >
                  Fill in Details
                </Tag>
              </div>
            );
          case "requires_confirmation":
            return (
              <div>
                <Icon
                  name="arrow-circle-o-left"
                  rotate="180"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                <Tag color="#688ff1" style={{ whiteSpace: "normal" }}>
                  Confirm payment
                </Tag>
              </div>
            );
          case "requires_action":
            return (
              <div>
                <Icon
                  name="lock"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                <Tag color="#688ff1" style={{ whiteSpace: "normal" }}>
                  Authenticate payment
                </Tag>
              </div>
            );
          case "processing":
            return (
              <div>
                <Icon
                  name="clock"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                <Tag color="#688ff1" style={{ whiteSpace: "normal" }}>
                  Processing order...
                </Tag>
              </div>
            );

          case "succeeded":
            return (
              <div>
                <Icon
                  name="check-circle"
                  style={{ color: "#33c280", marginRight: "5px" }}
                />
                <Tag color="green" style={{ whiteSpace: "normal" }}>
                  Payment successful
                </Tag>
              </div>
            );

          case "canceled":
            return (
              <div>
                <Icon
                  name="warning"
                  style={{ color: "#ed5f74", marginRight: "5px" }}
                />
                <Tag color="#ed5f74" style={{ whiteSpace: "normal" }}>
                  Order canceled
                </Tag>
              </div>
            );

          default:
            return status;
        }
      },
    },
    {
      title: "Description",
      dataIndex: "description",
      key: "description",
    },
    {
      title: "Date",
      dataIndex: "intent",
      key: "date",
      render: ({ created }) => <TimeAgo date={created * 1000} />,
    },
  ];

  const dataSource = paymentIntents.map((intent) => {
    return {
      key: intent.id,
      status: intent.status,
      amount: intent.amount,
      description: intent.description,
      intent,
    };
  });

  return (
    <Table
      pagination={false}
      dataSource={dataSource}
      columns={columns}
      expandable={{
        expandRowByClick: true,
        expandedRowRender: ({ intent: paymentIntent }) => (
          <PaymentDetails
            paymentIntent={paymentIntent}
            onFinished={onFinished}
            account_id={account_id}
          />
        ),
      }}
    />
  );
}

function PaymentDetails({ paymentIntent, account_id, onFinished }) {
  const isAdmin = !!account_id;
  const [paymentMethod, setPaymentMethod] = useState<any>(null);
  const [invoice, setInvoice] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const updatePaymentMethod = async () => {
    const { payment_method } = paymentIntent;
    if (!payment_method) {
      return;
    }
    try {
      setPaymentMethod(
        await getPaymentMethod({
          user_account_id: account_id,
          id: payment_method,
        }),
      );
    } catch (err) {
      const error = `${err}`;
      // Invalid request I think means the payment method was deleted.
      if (!error.includes("Invalid request")) {
        setError(`${err}`);
      }
    }
  };
  const updateInvoice = async () => {
    const { invoice: invoice_id } = paymentIntent;
    if (!invoice_id) {
      return;
    }
    try {
      setInvoice(await getInvoice(invoice_id));
    } catch (err) {
      setError(`${err}`);
    }
  };
  const update = async () => {
    try {
      setLoading(true);
      await Promise.all([updatePaymentMethod(), updateInvoice()]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    update();
  }, [paymentIntent, account_id]);

  return (
    <div>
      {needsAttention(paymentIntent) && (
        <>
          {!isAdmin && (
            <div>
              <div
                style={{
                  margin: "auto",
                  maxWidth: "800px",
                  background: "white",
                  padding: "30px 0",
                }}
              >
                <FinishStripePayment
                  onFinished={onFinished}
                  paymentIntent={paymentIntent}
                />
              </div>
            </div>
          )}
          {isAdmin && (
            <AdminCancelPayment id={paymentIntent.id} onFinished={onFinished} />
          )}
        </>
      )}
      {loading && <Spin />}
      <ShowError error={error} setError={setError} />
      <Space style={{ marginLeft: "30px", float: "right" }}>
        <RawJson value={paymentIntent} />
        <InvoiceLink invoice={invoice} />
      </Space>
      {paymentMethod && (
        <div>
          <PaymentMethod paymentMethod={paymentMethod} compact />
        </div>
      )}
      {invoice && (
        <div>
          <Invoice invoice={invoice} />
        </div>
      )}
    </div>
  );
}

function InvoiceLink({ invoice }) {
  if (invoice == null) {
    return null;
  }
  const due =
    invoice.due_date ??
    invoice.status_transitions?.finalized_at ??
    invoice.created;
  const dueDate = due ? dayjs(due * 1000) : dayjs();
  const now = dayjs();
  // "Invoice URLs expire 30 days after the due date."
  // https://docs.stripe.com/invoicing/hosted-invoice-page
  const isExpired = now.diff(dueDate, "days") > 30;
  return (
    <Button
      disabled={isExpired}
      href={invoice.hosted_invoice_url}
      type="link"
      target="_blank"
    >
      <Icon name="external-link" /> Invoice and Receipt{" "}
      {isExpired ? " (expired)" : undefined}
    </Button>
  );
}
function Invoice({ invoice }) {
  const lineItems = invoice.lines?.data.map(({ amount, description }) => {
    return { description, amount: stripeToDecimal(amount) };
  });
  if (invoice.subtotal != null) {
    lineItems.push({
      extra: true,
      description: "Subtotal",
      amount: stripeToDecimal(invoice.subtotal),
    });
  }
  if (invoice.tax != null) {
    lineItems.push({
      extra: true,
      description: "Tax",
      amount: stripeToDecimal(invoice.tax),
    });
  }
  if (invoice.total != null) {
    lineItems.push({
      extra: true,
      description: "Total",
      amount: stripeToDecimal(invoice.total),
    });
  }
  if (invoice.amount_paid != null) {
    lineItems.push({
      extra: true,
      description: "Amount paid",
      amount: stripeToDecimal(-invoice.amount_paid),
    });
  }
  if (invoice.total != null && invoice.amount_paid != null) {
    lineItems.push({
      extra: true,
      description: "Amount due",
      amount: stripeToDecimal(
        decimalSubtract(invoice.total, invoice.amount_paid),
      ),
    });
  }
  return <LineItemsTable lineItems={lineItems} currency={invoice.currency} />;
}

function needsAttention(paymentIntent) {
  return (
    paymentIntent.status != "succeeded" &&
    paymentIntent.status != "canceled" &&
    paymentIntent.status != "processing"
  );
}

function AdminCancelPayment({ id, onFinished }) {
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string>("");

  const doCancel = async () => {
    try {
      setError("");
      await cancelPaymentIntent({ id, reason });
      onFinished?.();
    } catch (err) {
      setError(`${err}`);
    }
  };

  return (
    <div>
      <Space>
        <Select
          style={{ width: "300px" }}
          options={PAYMENT_INTENT_REASONS.map((value) => {
            return { value, label: capitalize(replace_all(value, "_", " ")) };
          })}
          value={reason}
          onChange={setReason}
        />
        <Popconfirm
          title="Cancel the Payment Request"
          description="Are you sure to cancel this payment request?"
          onConfirm={doCancel}
          cancelText="No"
        >
          <Button type="primary" disabled={!reason}>
            Cancel Payment...
          </Button>
        </Popconfirm>
      </Space>
      <br />
      <ShowError error={error} setError={setError} />
    </div>
  );
}

export function PaymentsButton(props: Props) {
  const [show, setShow] = useState<boolean>(false);
  return (
    <div>
      <Button onClick={() => setShow(!show)} type={show ? "dashed" : undefined}>
        <Icon name="credit-card" /> Payments
      </Button>
      {show && (
        <div style={{ marginTop: "8px" }}>
          <Payments {...props} />
        </div>
      )}
    </div>
  );
}

// Removed for now so it will work on the nextjs site with SSR:

// function PaymentsPlot({ data: data0 }) {
//   const data = useMemo(() => {
//     const v = data0
//       .filter(({ status }) => status == "succeeded")
//       .map(({ amount, created }) => {
//         return { amount: amount / 100, date: new Date(created * 1000) };
//       });
//     v.sort(field_cmp("date"));
//     return v;
//   }, [data0]);
//   return (
//     <SpendPlot
//       data={data}
//       title={"Payments to CoCalc Shown Above"}
//       description={
//         "This is a plot of the money you have successfully transferred into CoCalc, as listed in the table above."
//       }
//       style={{ margin: "15px 0" }}
//     />
//   );
// }
