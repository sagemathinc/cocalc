import { Button, Flex, Modal, Space, Spin } from "antd";
import Balance from "./balance";
import { useEffect, useRef, useState } from "react";
import ShowError from "@cocalc/frontend/components/error";
import { redux } from "@cocalc/frontend/app-framework";
import Payments from "@cocalc/frontend/purchases/payments";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export default function BalanceModal({
  onRefresh,
  onClose,
}: {
  onRefresh?: Function;
  onClose: Function;
}) {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const refreshPaymentsRef = useRef<any>(null);

  const handleRefresh = async () => {
    try {
      onRefresh?.();
      setError("");
      setLoading(true);
      // this triggers an update indirectly
      await webapp_client.purchases_client.getBalance();
      await refreshPaymentsRef.current?.();
    } catch (err) {
      setError(`${err}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleRefresh();
  }, []);

  return (
    <Modal
      width={800}
      title={
        <Flex style={{ paddingRight: "30px" }}>
          <div style={{ fontSize: "14pt" }}>
            Balance {loading && <Spin style={{ marginLeft: "15px" }} />}
          </div>
          <div style={{ flex: 1 }} />
          <Links onClose={onClose} />
        </Flex>
      }
      open
      onOk={() => {
        onClose();
      }}
      onCancel={() => {
        onClose();
      }}
    >
      <div style={{ textAlign: "center" }}>
        <Balance
          refresh={() => {
            handleRefresh();
            setTimeout(handleRefresh, 15000);
          }}
        />
      </div>
      <ShowError error={error} setError={setError} />
      <Payments
        unfinished
        refreshPaymentsRef={refreshPaymentsRef}
        refresh={handleRefresh}
      />
    </Modal>
  );
}

const LINKS = [
  { label: "Purchases", value: "purchases" },
  { label: "Payments", value: "payments" },
  { label: "Methods", value: "payment-methods" },
  { label: "Statements", value: "statements" },
  { label: "Pay As You Go", value: "payg" },
];

function openPage(value) {
  redux.getActions("page").set_active_tab("account");
  redux.getActions("account").set_active_tab(value);
}

function Links({ onClose }) {
  return (
    <Space.Compact>
      {LINKS.map(({ label, value }) => (
        <Button
          key={value}
          size="small"
          type="link"
          onClick={() => {
            openPage(value);
            onClose();
          }}
        >
          {label}
        </Button>
      ))}
      <Button
        size="small"
        type="link"
        key="store"
        target="_blank"
        href={join(appBasePath, "store")}
      >
        Store
      </Button>
    </Space.Compact>
  );
}
