import { Button, Modal, Spin } from "antd";
import Balance from "./balance";
import { useEffect, useState } from "react";
import {
  getBalance as getBalanceUsingApi,
  getPendingBalance as getPendingBalanceUsingApi,
} from "./api";
import { currency, round2down } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";

export default function BalanceButton({
  style,
  onRefresh,
  minimal = false,
}: {
  style?;
  onRefresh?: () => void;
  minimal?: boolean;
}) {
  const [open, setOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [pendingBalance, setPendingBalance] = useState<number | null>(null);
  const [error, setError] = useState<string>("");

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
    <>
      <Button
        size={minimal ? "small" : undefined}
        type="text"
        style={style}
        onClick={() => {
          handleRefresh();
          setOpen(!open);
        }}
      >
        {!minimal && <>Balance: </>}
        {minimal && "("}
        {balance ? currency(round2down(balance)) : undefined}
        {minimal && ")"}
        {!minimal && loading && <Spin style={{ marginLeft: "5px" }} />}
      </Button>
      <Modal
        width={700}
        title={"Balance"}
        open={open}
        onOk={() => {
          setOpen(false);
          handleRefresh();
        }}
        onCancel={() => {
          setOpen(false);
          handleRefresh();
        }}
      >
        <div style={{ textAlign: "center" }}>
          <Balance
            balance={balance}
            pendingBalance={pendingBalance}
            refresh={() => {
              handleRefresh();
              setTimeout(handleRefresh, 5000);
              setTimeout(handleRefresh, 15000);
            }}
            showTransferLink
          />
        </div>
        <ShowError error={error} setError={setError} />
      </Modal>
    </>
  );
}
