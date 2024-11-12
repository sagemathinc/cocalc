import { Modal, Spin } from "antd";
import Balance from "./balance";
import { useEffect, useRef, useState } from "react";
import {
  getBalance as getBalanceUsingApi,
  getPendingBalance as getPendingBalanceUsingApi,
} from "./api";
import ShowError from "@cocalc/frontend/components/error";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import Payments from "@cocalc/frontend/purchases/payments";

export default function BalanceModal({
  onRefresh,
  onClose,
}: {
  onRefresh?: Function;
  onClose: Function;
}) {
  const [loading, setLoading] = useState<boolean>(true);
  const dbBalance = useTypedRedux("account", "balance");
  const [balance, setBalance] = useState<number | null>(dbBalance ?? null);
  const [pendingBalance, setPendingBalance] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const refreshPaymentsRef = useRef<any>(null);

  useEffect(() => {
    if (dbBalance != null) {
      setBalance(dbBalance);
    }
  }, [dbBalance]);

  const getBalance = async () => {
    setBalance(await getBalanceUsingApi());
  };
  const getPendingBalance = async () => {
    setPendingBalance(await getPendingBalanceUsingApi());
  };

  const handleRefresh = async () => {
    try {
      onRefresh?.();
      setError("");
      setLoading(true);
      await Promise.all([getBalance(), getPendingBalance()]);
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
      width={700}
      title={<>Balance {loading && <Spin style={{ marginLeft: "15px" }} />}</>}
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
          balance={balance}
          pendingBalance={pendingBalance}
          refresh={() => {
            handleRefresh();
            setTimeout(handleRefresh, 15000);
          }}
          showTransferLink
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
