import { Alert, Button, Divider, Modal, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@cocalc/frontend/components";
import { zIndexPayAsGo } from "./zindex";
import {
  isPurchaseAllowed,
  costToResumeSubscription,
  resumeSubscription,
  getSubscription,
} from "./api";
import StripePayment from "@cocalc/frontend/purchases/stripe-payment";
import type { LineItem } from "@cocalc/util/stripe/types";
import { currency, round2up } from "@cocalc/util/misc";
import { decimalSubtract } from "@cocalc/util/stripe/calc";
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
  const [place, setPlace] = useState<"checkout" | "processing" | "congrats">(
    "checkout",
  );
  const [disabled, setDisabled] = useState<boolean>(false);
  const numPaymentsRef = useRef<number | null>(null);
  const [costToResume, setCostToResume] = useState<number | undefined>(
    undefined,
  );
  const [periodicCost, setPeriodicCost] = useState<number | undefined>(
    undefined,
  );
  const [loading, setLoading] = useState<boolean>(false);

  const update = async () => {
    if (!open) {
      return;
    }
    try {
      const { cost, periodicCost } =
        await costToResumeSubscription(subscription_id);
      setCostToResume(cost);
      setPeriodicCost(periodicCost);
      const { chargeAmount = 0 } = await isPurchaseAllowed("license", cost);
      const lineItems: LineItem[] = [
        {
          description: `Fee to resume Subscription Id ${subscription_id}`,
          amount: cost,
        },
      ];
      if (chargeAmount < cost) {
        lineItems.push({
          description: "Apply account balance towards resuming subscription",
          amount: -decimalSubtract(cost, chargeAmount),
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
                    at the current rate, which is
                    {currency(round2up(periodicCost))}/{interval}.
                  </>
                ) : (
                  <>
                    To resume your subscription,{" "}
                    <b>
                      please pay the current rate of{" "}
                      {currency(round2up(periodicCost))}
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
        {place == "checkout" && lineItems != null && (
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
                    console.log("total = 0 so pay directly");
                    // user is paying entirely using their credit on file, so we need to get
                    // the purchase to happen via the API. Otherwise, they paid and metadata
                    // got setup so when that payment intent is processed, their item gets
                    // allocated.
                    try {
                      setError("");
                      setDisabled(true);
                      setPlace("processing");
                      await resumeSubscription(subscription_id);
                    } catch (err) {
                      setError(`${err}`);
                      return;
                    } finally {
                      setDisabled(false);
                    }
                    setPlace("congrats");
                    return;
                  }
                  setPlace("processing");
                }}
              />
            </div>
          </>
        )}
        {place != "processing" && (
          <Payments
            purpose={RESUME_SUBSCRIPTION}
            numPaymentsRef={numPaymentsRef}
            limit={5}
          />
        )}
      </div>
    );
  }

  return (
    <Modal
      closable={setOpen != null}
      open={open}
      zIndex={zIndexPayAsGo - 1}
      width={800}
      destroyOnClose
      footer={status != "active" ? null : undefined}
      onOk={() => setOpen?.(false)}
      onCancel={() => setOpen?.(false)}
      title={
        <>
          <Icon name="credit-card" style={{ marginRight: "10px" }} />
          Pay to Resume Subscription Id {subscription_id}
        </>
      }
    >
      {body}
    </Modal>
  );
}
