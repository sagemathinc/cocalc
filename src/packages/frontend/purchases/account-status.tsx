/* Status of your purchases

This is your balance, limit and spending rate.
*/

import { Divider } from "antd";
import Balance from "./balance";
import { useEffect, useState } from "react";
import {
  getBalance as getBalanceUsingApi,
  getPendingBalance as getPendingBalanceUsingApi,
} from "./api";
import Refresh from "./refresh";
import { currency, round2down } from "@cocalc/util/misc";
import ShowError from "@cocalc/frontend/components/error";

const MAX_WIDTH = "900px";

export default function AccountStatus({
  style,
  onRefresh,
}: {
  style?;
  onRefresh?: () => void;
}) {
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
      setBalance(null);
      setPendingBalance(null);
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
    <div style={style}>
      <Refresh
        handleRefresh={handleRefresh}
        disabled={loading}
        style={{ float: "right" }}
      />
      <Divider orientation="left">
        Balance
        {balance != null ? `: ${currency(round2down(balance))}` : undefined}
      </Divider>
      <ShowError
        error={error}
        setError={setError}
        style={{ marginBottom: "15px" }}
      />
      <div style={{ textAlign: "center" }}>
        <div style={{ maxWidth: MAX_WIDTH, margin: "15px auto" }}>
          <Balance
            balance={balance}
            pendingBalance={pendingBalance}
            refresh={handleRefresh}
            showTransferLink
          />
        </div>
      </div>
    </div>
  );
}
