import { Alert, Button, Divider, Modal, Space, Spin } from "antd";
import { useEffect, useRef, useState } from "react";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import dayjs from "dayjs";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { zIndexPayAsGo } from "../zindex";
import Cost, { getCost } from "./cost";
import { isPurchaseAllowed } from "../api";
import { redux } from "@cocalc/frontend/app-framework";
import PayLink from "./pay-link";
import Transfer from "./transfer";
import StripePayment from "@cocalc/frontend/purchases/stripe-payment";
import type { LineItem } from "@cocalc/util/stripe/types";
import { currency } from "@cocalc/util/misc";
import { decimalSubtract } from "@cocalc/util/stripe/calc";
import Payments from "@cocalc/frontend/purchases/payments";

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
  const [done, setDone] = useState<boolean>(false);
  const numPaymentsRef = useRef<number | null>(null);

  const update = async () => {
    const cost = getCost(purchaseInfo);
    try {
      const { chargeAmount = 0 } = await isPurchaseAllowed("license", cost);
      const lineItems: LineItem[] = [
        {
          description: `Course fee for project "${redux.getStore("projects").get_title(project_id)}"`,
          amount: cost,
        },
      ];
      if (chargeAmount < cost) {
        lineItems.push({
          description: "Apply account balance toward course fee.",
          amount: -decimalSubtract(cost, chargeAmount),
        });
      }
      setLineItems(lineItems);
      if (cost < chargeAmount) {
        setReason(
          `NOTE: There is a minimum charge of ${currency(chargeAmount)}.`,
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
      destroyOnClose
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
      {error && (
        <Alert
          closable
          type="error"
          message={error}
          onClose={() => setError("")}
        />
      )}
      Due: <TimeAgo date={when} />
      <div style={{ textAlign: "center", fontSize: "15pt" }}>
        Course Fee: <Cost purchaseInfo={purchaseInfo} />
      </div>
      <Divider />
      {done && (
        <div>
          When all open payments below are processed, you will be able to access
          your project.
          <Payments
            unfinished
            purpose={`student-pay-${project_id}`}
            numPaymentsRef={numPaymentsRef}
          />
        </div>
      )}
      {!done && lineItems == null && <Spin />}
      {!done && lineItems != null && (
        <>
          <div style={{ textAlign: "center" }}>
            <StripePayment
              lineItems={lineItems}
              description="Pay fee for access to a course."
              purpose={`student-pay-${project_id}`}
              metadata={{ student_pay: project_id }}
              onFinished={async () => {
                setDone(true);
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
      {!done && (
        <>
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
              Close Project
            </Button>
          </Space>
        </>
      )}
    </Modal>
  );
}
//      <pre>{JSON.stringify({ allowed, reason }, undefined, 2)}</pre>
//      <pre>{JSON.stringify(purchaseInfo, undefined, 2)}</pre>
