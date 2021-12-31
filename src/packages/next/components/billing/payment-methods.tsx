import useAPI from "lib/hooks/api";
import Loading from "components/share/loading";
import A from "components/misc/A";
import Timestamp from "components/misc/timestamp";
import { Alert, Table } from "antd";
import { capitalize } from "@cocalc/util/misc";
import { Icon } from "@cocalc/frontend/components/icon";

function renderTimestamp(x) {
  return <Timestamp epoch={x} />;
}

const columns = [
  {
    title: "Type",
    render: (_, { card }) => (
      <>
        {" "}
        <Icon name={`cc-${card.brand}`} /> {capitalize(card.brand)}
      </>
    ),
  },
  {
    title: "Number",
    render: (_, { card }) => `...${card.last4}`,
  },
  {
    title: "Expiration Date",
    align: "center",
    render: (_, { card }) => `${card.exp_month}/${card.exp_year}`,
  },
  {
    title: "Country",
    align: "center",
    render: (_, { card }) =>
      card.country ?? "",
  },
  {
    title: "Postal Code",
    align: "center",
    render: (_, { billing_details }) =>
      billing_details.address.postal_code ?? "",
  },
  {
    title: "Added",
    dataIndex: "created",
    render: (x) => <Timestamp epoch={x * 1000} />,
  },
];

export default function PaymentMethods() {
  const { result, error } = useAPI("billing/get-payment-methods");
  if (error) {
    return <Alert type="error" message={error} />;
  }
  if (!result) {
    return <Loading />;
  }
  return (
    <div>
      <h3>Payment Methods</h3>
      These are the credit cards and other payment methods that you have
      currently setup. Note that CoCalc does not directly store the actual
      credit card numbers (they are instead stored securely by{" "}
      <A href="https://stripe.com/" external>
        Stripe
      </A>
      ).
      <Table
        columns={columns}
        dataSource={result.data}
        rowKey={"id"}
        style={{ marginTop: "15px" }}
        pagination={{ hideOnSinglePage: true, pageSize: 100 }}
      />
      {result.data.has_more && (
        <Alert
          type="warning"
          showIcon
          message="WARNING: Some of your cards are not displayed above, since there are so many."
        />
      )}
    </div>
  );
}
