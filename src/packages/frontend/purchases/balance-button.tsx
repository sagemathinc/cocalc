import { Badge, Button, Spin } from "antd";
import { useEffect, useState } from "react";
import { getBalance as getBalanceUsingApi } from "./api";
import { currency, round2down } from "@cocalc/util/misc";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import BalanceModal from "@cocalc/frontend/purchases/balance-modal";

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
  const dbBalance = useTypedRedux("account", "balance");
  const balanceAlert = useTypedRedux("account", "balance_alert");
  const [balance, setBalance] = useState<number | null>(dbBalance ?? null);

  useEffect(() => {
    if (dbBalance != null) {
      setBalance(dbBalance);
    }
  }, [dbBalance]);

  const getBalance = async () => {
    setBalance(await getBalanceUsingApi());
  };

  const handleRefresh = async () => {
    try {
      onRefresh?.();
      setLoading(true);
      await getBalance();
    } catch (err) {
      console.warn("Issue updating balance", err);
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
        type={"text"}
        style={{
          ...style,
          ...(balanceAlert
            ? { backgroundColor: "red", color: "white", marginRight: "5px" }
            : undefined),
        }}
        onClick={() => {
          handleRefresh();
          setOpen(!open);
        }}
      >
        {!minimal && <>Balance: </>}
        {balance != null ? currency(round2down(balance)) : undefined}
        {balanceAlert && (
          <Badge
            count={1}
            size="small"
            style={{ backgroundColor: "#688ff1" }}
          />
        )}
        {!minimal && loading && <Spin style={{ marginLeft: "5px" }} />}
      </Button>
      {open && (
        <BalanceModal
          onRefresh={handleRefresh}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
