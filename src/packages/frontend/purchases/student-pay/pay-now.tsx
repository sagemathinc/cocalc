import { Alert, Button, Divider, Modal, Spin } from "antd";
import { useEffect, useState } from "react";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import dayjs from "dayjs";
import { Icon, TimeAgo } from "@cocalc/frontend/components";
import { zIndex as zIndexPayAsGo } from "../pay-as-you-go/modal";
import Cost, { getCost } from "./cost";
import { isPurchaseAllowed, studentPay } from "../api";
import { webapp_client } from "@cocalc/frontend/webapp-client";

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
  const [purchasing, setPurchasing] = useState<boolean>(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [reason, setReason] = useState<string | undefined | null>(null);
  const [error, setError] = useState<string>("");
  const update = async () => {
    const cost = getCost(purchaseInfo);
    try {
      let { allowed, reason } = await isPurchaseAllowed("license", cost);
      if (!allowed) {
        await webapp_client.purchases_client.quotaModal({
          service: "license",
          reason,
          allowed,
          cost,
        });
      }
      ({ allowed, reason } = await isPurchaseAllowed("license", cost));
      setAllowed(allowed);
      setReason(reason);
    } catch (err) {
      setError(`${err}`);
    }
  };
  useEffect(() => {
    update();
  }, [purchaseInfo]);
  const completePurchase = async () => {
    try {
      setPurchasing(true);
      await studentPay(project_id);
    } catch (err) {
      setError(`${err}`);
    } finally {
      setPurchasing(false);
    }
  };

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
          <Icon name="credit-card" style={{ marginRight: "10px" }} /> Pay the
          course fee to upgrade this project
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
        <Cost purchaseInfo={purchaseInfo} />
      </div>
      <Divider />
      <div style={{ textAlign: "center" }}>
        {allowed && (
          <div>
            <Alert
              showIcon
              style={{ marginBottom: "15px " }}
              type="success"
              message="You have enough credit to complete this purchase."
            />
            <Button
              disabled={purchasing}
              size="large"
              type="primary"
              onClick={completePurchase}
            >
              Complete Purchase... {purchasing && <Spin />}
            </Button>
          </div>
        )}
        {!allowed && (
          <Button onClick={() => update()} type="primary">
            Add to Balance...
          </Button>
        )}
      </div>
      {!allowed && (
        <Alert
          style={{ marginTop: "15px" }}
          type="warning"
          showIcon
          message="Add Credit"
          description={reason}
        />
      )}
    </Modal>
  );
}
//      <pre>{JSON.stringify({ allowed, reason }, undefined, 2)}</pre>
//      <pre>{JSON.stringify(purchaseInfo, undefined, 2)}</pre>
