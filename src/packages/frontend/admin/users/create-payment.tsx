import {
  Alert,
  Button,
  Card,
  Flex,
  Input,
  InputNumber,
  Space,
  Spin,
} from "antd";
import { createPaymentIntent } from "@cocalc/frontend/purchases/api";
import { Icon } from "@cocalc/frontend/components/icon";
import { useRef, useState } from "react";
import { currency } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";
import type { LineItem } from "@cocalc/util/stripe/types";
import { LineItemsTable } from "@cocalc/frontend/purchases/line-items";

const DEFAULT_PAYMENT = 10;

interface Props {
  account_id: string;
  onClose?: () => void;
}

export default function CreatePayment({ account_id, onClose }: Props) {
  const [paymentDescription, setPaymentDescription] = useState<string>(
    "Manually entered payment initiated by CoCalc staff",
  );
  const [amount, setAmount] = useState<number | null>(DEFAULT_PAYMENT);
  const [total, setTotal] = useState<number>(0);
  const [description, setDescription] = useState<string>(
    "Add credit to account",
  );
  const purposeRef = useRef<string>(`admin-${Date.now()}`);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [done, setDone] = useState<boolean>(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const doIt = async () => {
    if (typeof amount != "number") {
      throw Error("amount must be a number");
    }
    try {
      setError("");
      setLoading(true);
      await createPaymentIntent({
        user_account_id: account_id,
        lineItems,
        description: paymentDescription,
        purpose: purposeRef.current,
      });
      setDone(true);
    } catch (err) {
      console.warn("Creating payment failed", err);
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card title={"Create Payment"}>
      <Input
        disabled={done || loading}
        style={{ flex: 1, maxWidth: "700px", marginBottom: "15px" }}
        placeholder="Payment Description..."
        value={paymentDescription}
        onChange={(e) => setPaymentDescription(e.target.value)}
      />
      <LineItemsTable lineItems={lineItems} />
      <Flex gap="middle" style={{ margin: "15px 0" }}>
        <Input
          disabled={done || loading}
          style={{ flex: 1, maxWidth: "400px" }}
          placeholder="Description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <InputNumber
          disabled={done || loading}
          min={0}
          max={10000}
          addonBefore="$"
          placeholder="Amount..."
          style={{ maxWidth: "100px" }}
          value={amount}
          onChange={(value) =>
            setAmount(typeof value == "string" ? null : value)
          }
        />
        <Button
          disabled={!amount || !description || loading || done || !!error}
          onClick={() => {
            if (!amount) {
              return;
            }
            setLineItems(lineItems.concat([{ amount, description }]));
            setTotal(total + amount);
            setAmount(DEFAULT_PAYMENT);
            setDescription("");
          }}
        >
          Add Line Item
        </Button>
      </Flex>
      <Space style={{ marginBottom: "15px" }}>
        {onClose != null && (
          <Button onClick={onClose}>{done ? "Close" : "Cancel"}</Button>
        )}{" "}
        <Button
          disabled={
            !!error ||
            done ||
            loading ||
            !paymentDescription ||
            lineItems.length == 0 ||
            total == 0
          }
          type="primary"
          onClick={doIt}
        >
          {done ? (
            <>Created Payment</>
          ) : (
            <>
              Create Payment{" "}
              {loading && <Spin style={{ marginLeft: "15px" }} />}
            </>
          )}
        </Button>
      </Space>
      <br />
      <ShowError error={error} setError={setError} />
      <br />
      {done && (
        <div>
          <Alert
            showIcon
            style={{ margin: "15px auto 0 auto", maxWidth: "700px" }}
            type="success"
            message="Payment Successfully Created"
          />
        </div>
      )}
      <div>
        <Alert
          style={{ margin: "15px auto", maxWidth: "700px" }}
          type="info"
          description={
            <>
              User will be charged {currency(total)} (+ tax). When the payment
              is completed, a credit will be added to the user's account. If
              they have an automatic payment method on file (e.g. a credit
              card), then this may be instant. Click the "Payments" button above
              to see the status of any payments.
            </>
          }
        />
      </div>
    </Card>
  );
}

export function CreatePaymentButton(props: Props) {
  const [show, setShow] = useState<boolean>(false);
  return (
    <div>
      <Button onClick={() => setShow(!show)} type={show ? "dashed" : undefined}>
        <Icon name="credit-card" /> Create Payment
      </Button>
      {show && (
        <div style={{ marginTop: "8px" }}>
          <CreatePayment {...props} onClose={() => setShow(false)} />
        </div>
      )}
    </div>
  );
}
