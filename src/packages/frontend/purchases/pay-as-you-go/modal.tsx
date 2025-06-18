import { Alert, Modal } from "antd";
import { useRef } from "react";
import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import { QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";
import MoneyStatistic from "../money-statistic";
import QuotaConfig from "../quota-config";
import ServiceTag from "../service";
import { zIndexPayAsGo as zIndex } from "../zindex";
import Cost from "./cost";

// Ensure the billing Actions and Store are created, which are needed for purchases, etc., to work...
import "@cocalc/frontend/billing/actions";

export default function PayAsYouGoModal({}) {
  const actions = useActions("billing");
  const saveRef = useRef<any>();

  const storeState: {
    showModal?: boolean;
    service?: Service;
    allowed?: boolean;
    cost?: number;
    reason?: string;
    cost_per_hour?: number;
  } = useTypedRedux("billing", "pay_as_you_go")?.toJS() ?? {};

  const updateAllowed = async () => {
    const x = await webapp_client.purchases_client.isPurchaseAllowed(
      storeState.service as Service,
      storeState.cost,
    );
    if (x?.allowed) {
      // done -- close the modal
      handleOk();
      return;
    }
    actions.setState({ pay_as_you_go: { ...storeState, ...x } as any });
  };
  const handleCancel = () => {
    actions.setState({ pay_as_you_go: { showModal: false } as any });
  };
  const handleOk = async () => {
    await saveRef.current?.();
    actions.setState({ pay_as_you_go: { showModal: false } as any });
  };

  // destroyOnHidden so values in quota input get updated
  return (
    <Modal
      width={800}
      zIndex={zIndex}
      destroyOnHidden
      maskClosable={false}
      open={storeState.showModal}
      title={
        <>
          <Icon name="credit-card" style={{ marginRight: "15px" }} /> Pay for{" "}
          <ServiceTag
            service={storeState.service as Service}
            style={{ fontSize: "16px" }}
          />
        </>
      }
      onCancel={handleCancel}
      onOk={handleOk}
    >
      {!storeState.allowed && (
        <Alert
          showIcon
          type="warning"
          style={{ margin: "15px 0" }}
          description={storeState.reason}
        />
      )}
      {storeState.allowed && (
        <Alert
          style={{ margin: "15px 0" }}
          showIcon
          type="success"
          description={<>Thanks! Your purchase should now be complete.</>}
        />
      )}
      {storeState.cost_per_hour != null && (
        <div style={{ color: "#666", marginBottom: "5px" }}>
          This purchase will be charged on a pay-as-you-go metered basis
          according to the following rate:
          <div style={{ textAlign: "center" }}>
            <MoneyStatistic
              value={storeState.cost_per_hour}
              title="Cost per hour"
            />
          </div>
        </div>
      )}
      {storeState.cost_per_hour == null &&
        storeState.service != null &&
        !QUOTA_SPEC[storeState.service]?.noSet && (
          <div>
            <div style={{ color: "#666", marginBottom: "5px" }}>
              This service is charged on a pay-as-you-go basis according to the
              following rates:
            </div>
            <Cost service={storeState.service} />
          </div>
        )}
      <div style={{ marginBottom: "15px" }} />
      {(!storeState.allowed || storeState.cost_per_hour != null) && (
        <QuotaConfig
          saveRef={saveRef}
          service={storeState.service as Service}
          updateAllowed={updateAllowed}
          cost={storeState.allowed ? undefined : storeState.cost}
        />
      )}
    </Modal>
  );
}
