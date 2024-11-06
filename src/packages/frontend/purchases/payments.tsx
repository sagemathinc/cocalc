import { useEffect, useMemo, useRef, useState } from "react";
import {
  cancelPaymentIntent,
  getInvoice,
  getPaymentMethod,
  getPayments,
} from "./api";
import {
  Alert,
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
import { capitalize, currency, replace_all } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components/time-ago";
import { Icon } from "@cocalc/frontend/components/icon";
import ShowError from "@cocalc/frontend/components/error";
import { PAYMENT_INTENT_REASONS } from "@cocalc/util/stripe/types";
import "./purchases.css";
import { describeNumberOf, RawJson } from "./util";
import { PaymentMethod } from "./payment-methods";
import SpendPlot from "./spend-plot";
import { field_cmp } from "@cocalc/util/misc";
import { decimalSubtract, stripeToDecimal } from "@cocalc/util/stripe/calc";
import { LineItemsTable } from "./line-items";
import dayjs from "dayjs";

interface Props {
  refresh?: () => Promise<void>;
  refreshPaymentsRef?;
  // if you are an admin and want to view a different user's incomplete payments
  account_id?: string;
}

export default function Payments({
  refresh,
  refreshPaymentsRef,
  account_id,
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
    if (now - lastLoadRef.current < 500) {
      return;
    }
    lastLoadRef.current = now;

    try {
      setError("");
      setLoading(true);
      let result;
      if (init || data == null || reset) {
        result = await getPayments({
          user_account_id: account_id,
          limit: hasLoadedMore ? 100 : 5,
        });
        setData(result.data);
      } else {
        result = await getPayments({
          user_account_id: account_id,
          starting_after: data[data.length - 1].id,
          limit: 100,
        });
        setData(data.concat(result.data));
        setHasLoadedMore(true);
      }
      setHasMore(result.has_more);
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
    refreshPaymentsRef.current = () => {
      loadMore({ init: true });
    };
  }

  return (
    <div>
      <Flex>
        <div style={{ flex: 1 }}>
          <Divider orientation="left">
            <Tooltip title="These are cash payments to CoCalc from some outside source.">
              {describeNumberOf({
                n: data?.length,
                hasMore,
                loadMore,
                loading,
                type: "payment",
              })}
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
        {data?.length == 0 && !hasMore && (
          <Alert showIcon type="info" message="No payments" />
        )}
        {data != null && data?.length > 0 && (
          <>
            <PaymentIntentsTable
              paymentIntents={data}
              onFinished={() => {
                loadMore({ init: true });
                refresh?.();
              }}
              account_id={account_id}
              scroll={hasLoadedMore ? { y: 400 } : undefined}
            />
            <PaymentsPlot data={data} />
          </>
        )}
      </div>
    </div>
  );
}

function PaymentIntentsTable({
  paymentIntents,
  onFinished,
  account_id,
  scroll,
}) {
  const columns = [
    {
      title: "Credit Id",
      render: (_, { intent }) => <>{intent?.metadata?.credit_id}</>,
    },
    {
      title: "Amount",
      dataIndex: "amount",
      key: "amount",
      render: (amount) => currency(amount / 100),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        // colors below are from https://docs.stripe.com/payments/paymentintents/lifecycle
        switch (status) {
          case "requires_payment_method":
            return (
              <div>
                <Icon
                  name="credit-card"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                <Tag color="#688ff1">Fill in payment details</Tag>
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
                <Tag color="#688ff1">Confirm payment</Tag>
              </div>
            );
          case "requires_action":
            return (
              <div>
                <Icon
                  name="lock"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                <Tag color="#688ff1">Authenticate your payment</Tag>
              </div>
            );
          case "processing":
            return (
              <div>
                <Icon
                  name="clock"
                  style={{ color: "#688ff1", marginRight: "5px" }}
                />
                <Tag color="#688ff1">Processing your order...</Tag>
              </div>
            );

          case "succeeded":
            return (
              <div>
                <Icon
                  name="check-circle"
                  style={{ color: "#33c280", marginRight: "5px" }}
                />
                <Tag color="green">Payment successful</Tag>
              </div>
            );

          case "canceled":
            return (
              <div>
                <Icon
                  name="warning"
                  style={{ color: "#ed5f74", marginRight: "5px" }}
                />
                <Tag color="#ed5f74">Order was canceled</Tag>
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
      scroll={scroll}
      rowClassName={(paymentIntent: any) =>
        [
          "requires_payment_method",
          "requires_confirmation",
          "requires_action",
        ].includes(paymentIntent.status)
          ? "cc-payments-highlight"
          : ""
      }
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
            <FinishStripePayment
              onFinished={onFinished}
              paymentIntent={paymentIntent}
            />
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
      <Icon name="external-link" /> Invoice{" "}
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
  return <LineItemsTable lineItems={lineItems} />;
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
      <Button onClick={() => setShow(!show)}>
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

function PaymentsPlot({ data: data0 }) {
  const data = useMemo(() => {
    const v = data0.map(({ amount, created }) => {
      return { amount: amount / 100, date: new Date(created * 1000) };
    });
    v.sort(field_cmp("date"));
    return v;
  }, [data0]);
  return (
    <SpendPlot
      data={data}
      title={"Payments to CoCalc Shown Above"}
      style={{ margin: "15px 0" }}
    />
  );
}
