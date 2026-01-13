import { Alert, Button, Divider, Modal, Space, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { zIndexPayAsGo } from "./zindex";
import {
  isPurchaseAllowed,
  costToResumeSubscription,
  resumeSubscription,
  getSubscription,
} from "./api";
import StripePayment, {
  BigSpin,
} from "@cocalc/frontend/purchases/stripe-payment";
import type { LineItem } from "@cocalc/util/stripe/types";
import { currency } from "@cocalc/util/misc";
import { moneyRound2Up, toDecimal } from "@cocalc/util/money";
import Payments from "@cocalc/frontend/purchases/payments";
import { RESUME_SUBSCRIPTION } from "@cocalc/util/db-schema/purchases";
import ShowError from "@cocalc/frontend/components/error";

interface Props {
  subscription_id: number;
  open: boolean;
  setOpen?: (open: boolean) => void;
  interval;
  status;
}

export default function ResumeSubscription({
  subscription_id,
  open,
  setOpen,
  interval,
  status: status0,
}: Props) {
  const [status, setStatus] = useState<string>(status0);
  const [error, setError] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[] | null>(null);
  const [place, setPlace] = useState<
    "checkout" | "processing" | "buying" | "congrats"
  >("checkout");
  const [disabled, setDisabled] = useState<boolean>(false);
  const numPaymentsRef = useRef<number | null>(null);
  const [costToResume, setCostToResume] = useState<number | undefined>(
    undefined,
  );
  const [periodicCost, setPeriodicCost] = useState<number | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState<boolean>(false);

  const directResume = async () => {
    // user is paying entirely using their credit on file, so we need to get
    // the purchase to happen via the API. Otherwise, they paid and metadata
    // got setup so when that payment intent is processed, their item gets
    // allocated.
    try {
      setError("");
      setDisabled(true);
      setPlace("buying");
      await resumeSubscription(subscription_id);
      setPlace("congrats");
      const { status } = await getSubscription(subscription_id);
      setStatus(status);
    } catch (err) {
      setPlace("checkout");
      setError(`${err}`);
      return;
    } finally {
      setDisabled(false);
    }
  };

  const update = async () => {
    if (!open) {
      return;
    }
    try {
      const { cost, periodicCost } =
        await costToResumeSubscription(subscription_id);
      const costValue = toDecimal(cost ?? 0);
      const periodicCostValue = toDecimal(periodicCost ?? 0);
      setCostToResume(costValue.toNumber());
      setPeriodicCost(periodicCostValue.toNumber());
      const { chargeAmount = 0 } = await isPurchaseAllowed(
        "license",
        costValue.toNumber(),
      );
      const chargeAmountValue = toDecimal(chargeAmount ?? 0);
      const lineItems: LineItem[] = [
        {
          description: `Fee to resume Subscription Id ${subscription_id}`,
          amount: costValue.toNumber(),
        },
      ];
      if (chargeAmountValue.lt(costValue)) {
        lineItems.push({
          description: "Apply account balance towards resuming subscription",
          amount: costValue.sub(chargeAmountValue).neg().toNumber(),
        });
      }
      setLineItems(lineItems);
    } catch (err) {
      setError(`${err}`);
    }
  };
  useEffect(() => {
    if (!open) {
      return;
    }
    update();
  }, [subscription_id, open]);

  let body;
  if (status == "active") {
    body = (
      <Alert
        type="success"
        message="You have successfully resumed your subscription!"
      />
    );
  } else {
    body = (
      <div>
        <ShowError
          style={{ margin: "30px" }}
          error={error}
          setError={setError}
        />
        {periodicCost != null && place == "checkout" && (
          <Alert
            showIcon
            style={{ margin: "30px" }}
            message={
              <div style={{ fontSize: "11pt" }}>
                {costToResume == 0 ? (
                  <>
                    <b>There is no charge</b> to resume your subscription, since
                    your license is still active. Your subscription will resume
                    at the current rate, which is{" "}
                    {currency(moneyRound2Up(periodicCost ?? 0).toNumber())}/
                    {interval}.
                  </>
                ) : (
                  <>
                    To resume your subscription,{" "}
                    <b>
                      please pay the current rate of{" "}
                      {currency(moneyRound2Up(periodicCost ?? 0).toNumber())}
                    </b>{" "}
                    for the next {interval}.
                  </>
                )}
              </div>
            }
          />
        )}
        <Divider />
        {place == "processing" && (
          <div>
            When all open payments below are processed, your subscription will
            resume.{" "}
            <Button
              disabled={loading}
              onClick={async () => {
                try {
                  setLoading(true);
                  setError("");
                  const { status } = await getSubscription(subscription_id);
                  setStatus(status);
                } catch (err) {
                  setError(`${err}`);
                } finally {
                  setLoading(false);
                }
              }}
            >
              Update Subscription Status
            </Button>
            <Payments
              purpose={RESUME_SUBSCRIPTION}
              numPaymentsRef={numPaymentsRef}
              limit={5}
            />
          </div>
        )}
        {place == "checkout" && lineItems == null && <Spin />}
        {place == "checkout" &&
          lineItems != null &&
          (costToResume == 0 ? (
            <div style={{ textAlign: "center" }}>
              <Space>
                <Button
                  size="large"
                  onClick={() => {
                    setOpen?.(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="primary"
                  size="large"
                  onClick={() => {
                    directResume();
                  }}
                >
                  Resume Subscription
                </Button>
              </Space>
            </div>
          ) : (
            <>
              <div style={{ textAlign: "center" }}>
                <StripePayment
                  disabled={disabled}
                  lineItems={lineItems}
                  description={`Pay fee to resume subscription id ${subscription_id}`}
                  purpose={RESUME_SUBSCRIPTION}
                  metadata={{ subscription_id: `${subscription_id}` }}
                  onFinished={async (total) => {
                    if (!total) {
                      directResume();
                    } else {
                      setPlace("processing");
                    }
                  }}
                />
              </div>
              <Payments
                purpose={RESUME_SUBSCRIPTION}
                numPaymentsRef={numPaymentsRef}
                limit={5}
              />
            </>
          ))}
      </div>
    );
  }

  return (
    <Modal
      closable={setOpen != null}
      open={open}
      zIndex={zIndexPayAsGo - 1}
      width={800}
      destroyOnHidden
      footer={status != "active" ? null : undefined}
      onOk={() => setOpen?.(false)}
      onCancel={() => setOpen?.(false)}
      title={
        <>
          <Icon name="credit-card" style={{ marginRight: "10px" }} />
          Resume Subscription Id {subscription_id}
        </>
      }
    >
      {body}
      {loading && <BigSpin />}
    </Modal>
  );
}
