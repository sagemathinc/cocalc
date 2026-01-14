import { Alert, Button, Divider, Modal, Space, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import type { PurchaseInfo } from "@cocalc/util/purchases/quota/types";
import dayjs from "dayjs";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { zIndexPayAsGo } from "../zindex";
import Cost, { getCost } from "./cost";
import { isPurchaseAllowed, studentPay } from "../api";
import { redux } from "@cocalc/frontend/app-framework";
import PayLink from "./pay-link";
import Transfer from "./transfer";
import StripePayment from "@cocalc/frontend/purchases/stripe-payment";
import type { LineItem } from "@cocalc/util/stripe/types";
import { currency } from "@cocalc/util/misc";
import { toDecimal } from "@cocalc/util/money";
import Payments from "@cocalc/frontend/purchases/payments";
import { STUDENT_PAY } from "@cocalc/util/db-schema/purchases";
import ShowError from "@cocalc/frontend/components/error";

interface Props {
  when: dayjs.Dayjs;
  purchaseInfo: PurchaseInfo;
  project_id: string;
  open: boolean;
  setOpen?: (open: boolean) => void;
}

export default function PayNow({
  when,
  purchaseInfo,
  project_id,
  open,
  setOpen,
}: Props) {
  const [reason, setReason] = useState<string | undefined | null>(null);
  const [error, setError] = useState<string>("");
  const [lineItems, setLineItems] = useState<LineItem[] | null>(null);
  const [place, setPlace] = useState<"checkout" | "processing" | "congrats">(
    "checkout",
  );
  const [disabled, setDisabled] = useState<boolean>(false);
  const numPaymentsRef = useRef<number | null>(null);

  const update = async () => {
    const costValue = toDecimal(getCost(purchaseInfo));
    try {
      const { chargeAmount = 0 } = await isPurchaseAllowed(
        "student-pay",
        costValue.toNumber(),
      );
      const chargeAmountValue = toDecimal(chargeAmount);
      const lineItems: LineItem[] = [
        {
          description: `Course fee for project "${redux.getStore("projects").get_title(project_id)}"`,
          amount: costValue.toNumber(),
        },
      ];
      if (chargeAmountValue.lt(costValue)) {
        lineItems.push({
          description: "Apply account balance toward course fee.",
          amount: chargeAmountValue.sub(costValue).toNumber(),
        });
      }
      setLineItems(lineItems);
      if (costValue.lt(chargeAmountValue)) {
        setReason(
          `NOTE: There is a minimum charge of ${currency(
            chargeAmountValue.toNumber(),
          )}.`,
        );
      } else {
        setReason(null);
      }
    } catch (err) {
      setError(`${err}`);
    }
  };
  useEffect(() => {
    update();
  }, [purchaseInfo]);

  return (
    <Modal
      closable={setOpen != null}
      open={open}
      zIndex={zIndexPayAsGo - 1}
      width={800}
      destroyOnHidden
      footer={null}
      onOk={() => setOpen?.(false)}
      onCancel={() => setOpen?.(false)}
      title={
        <>
          <Icon name="credit-card" style={{ marginRight: "10px" }} />
          Pay the course fee to access this project
        </>
      }
    >
      <ShowError error={error} setError={setError} />
      Due: <TimeAgo date={when} />
      <div style={{ textAlign: "center", fontSize: "15pt" }}>
        Course Fee: <Cost purchaseInfo={purchaseInfo} />
      </div>
      <Divider />
      {place == "processing" && (
        <div>
          When all open payments below are processed, you will be able to access
          your course project.
          <Payments
            purpose={STUDENT_PAY}
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
              description={`Course fee for project "${redux.getStore("projects").get_title(project_id)}"`}
              purpose={STUDENT_PAY}
              metadata={{ project_id }}
              onFinished={async (total) => {
                if (!total) {
                  // user is paying entirely using their credit on file, so we need to get
                  // the purchase to happen via the API. Otherwise, they paid and metadata
                  // got setup so when that payment intent is processed, their item gets
                  // allocated.
                  try {
                    setError("");
                    setDisabled(true);
                    await studentPay(project_id);
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
          {reason && (
            <Alert
              style={{ marginTop: "15px" }}
              type="warning"
              showIcon
              description={reason}
            />
          )}
        </>
      )}
      {/* Show this just in case the user started to pay with a slow/bad method, then
          refreshed their browser and then tried to pay agian.  They will clearly see
          the pending student payment. */}
      {place != "processing" && (
        <Payments
          purpose={STUDENT_PAY}
          numPaymentsRef={numPaymentsRef}
          limit={5}
        />
      )}
      <Divider>Other Options</Divider>
      <Space direction="vertical">
        <PayLink project_id={project_id} />
        <Transfer project_id={project_id} />
        <Button
          onClick={() => {
            const actions = redux.getActions("page");
            if (actions != null) {
              actions.close_project_tab(project_id);
            }
          }}
        >
          Close Workspace
        </Button>
      </Space>
    </Modal>
  );
}
//      <pre>{JSON.stringify({ allowed, reason }, undefined, 2)}</pre>
//      <pre>{JSON.stringify(purchaseInfo, undefined, 2)}</pre>
