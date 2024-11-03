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

interface Props {
  account_id: string;
  onClose?: () => void;
}

export default function CreatePayment({ account_id, onClose }: Props) {
  const [amount, setAmount] = useState<number | null | string>(null);
  const [description, setDescription] = useState<string>("");
  const purposeRef = useRef<string>(`admin-${Date.now()}`);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [done, setDone] = useState<boolean>(false);

  const doIt = async () => {
    if (typeof amount != "number") {
      throw Error("amount must be a number");
    }
    try {
      setError("");
      setLoading(true);
      await createPaymentIntent({
        user_account_id: account_id,
        amount,
        description,
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
      <Flex gap="middle" style={{ marginBottom: "15px" }}>
        <InputNumber
          disabled={done || loading}
          min={0}
          max={10000}
          placeholder="Amount..."
          value={amount}
          onChange={setAmount}
        />
        <Input
          disabled={done || loading}
          style={{ flex: 1 }}
          placeholder="Description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
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
            typeof amount != "number" ||
            amount < 1 ||
            amount > 10000 ||
            !description
          }
          type="primary"
          onClick={doIt}
        >
          {done ? (
            <>Created Payment</>
          ) : (
            <>Create Payment {loading && <Spin />}</>
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
            style={{ marginTop: "15px auto 0 auto", maxWidth: "700px" }}
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
              User will be charged{" "}
              {typeof amount == "number"
                ? currency(amount)
                : "the amount you enter"}
              , in exactly the same way automatic payments work. When the
              payment is completed a credit will be added to their account. If
              they have an automatic payment method on file (e.g. a credit
              card), then this will be nearly instant, but if they do not they
              may have a pending payment until they explicitly add a card or
              take other steps. Click the "Incomplete payments..." button above
              to see the status of any incomplicate payments or cancel one
              before it is done.
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
      <Button onClick={() => setShow(!show)}>
        <Icon name="credit-card" /> Create Payment...
      </Button>
      {show && (
        <div style={{ marginTop: "8px" }}>
          <CreatePayment {...props} onClose={() => setShow(false)} />
        </div>
      )}
    </div>
  );
}
