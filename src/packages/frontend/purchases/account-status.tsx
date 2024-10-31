/* Status of your purchases

This is your balance, limit and spending rate.
*/

import { Alert, Card, Divider, Space } from "antd";
import MinBalance from "./min-balance";
import Balance from "./balance";
import SpendRate from "./spend-rate";
import { useEffect, useRef, useState } from "react";
import {
  getBalance as getBalanceUsingApi,
  getPendingBalance as getPendingBalanceUsingApi,
  getMinBalance as getMinBalanceUsingApi,
  getSpendRate as getSpendRateUsingApi,
} from "./api";
import Config from "./config";
import Refresh from "./refresh";
import { currency, round2down } from "@cocalc/util/misc";
import Payments from "./payments";

const MAX_WIDTH = "900px";

export default function AccountStatus({
  compact,
  style,
  onRefresh,
}: {
  compact?: boolean;
  style?;
  onRefresh?: () => void;
}) {
  const [loading, setLoading] = useState<boolean>(true);
  const [balance, setBalance] = useState<number | null>(null);
  const [pendingBalance, setPendingBalance] = useState<number | null>(null);
  const [minBalance, setMinBalance] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [spendRate, setSpendRate] = useState<number | null>(null);

  const getSpendRate = async () => {
    setSpendRate(await getSpendRateUsingApi());
  };
  const getBalance = async () => {
    setBalance(await getBalanceUsingApi());
  };
  const getPendingBalance = async () => {
    setPendingBalance(await getPendingBalanceUsingApi());
  };
  const getMinBalance = async () => {
    setMinBalance(await getMinBalanceUsingApi());
  };

  const refreshPaymentsRef = useRef<any>(null);

  const handleRefresh = async () => {
    try {
      onRefresh?.();
      setLoading(true);
      setBalance(null);
      setPendingBalance(null);
      setMinBalance(null);
      setSpendRate(null);
      setError("");
      refreshPaymentsRef.current?.();
      await Promise.all([
        getSpendRate(),
        getBalance(),
        getMinBalance(),
        getPendingBalance(),
      ]);
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
      {error && (
        <Alert
          type="error"
          description={error}
          style={{ marginBottom: "15px" }}
        />
      )}
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
      <Divider orientation="left">Automatic Purchases</Divider>
      <div>
        <div style={{ margin: "auto", maxWidth: MAX_WIDTH }}>
          <Space style={{ alignItems: "flex-start" }}>
            <Card>
              <div style={{ color: "#888", marginBottom: "10px" }}>
                Subscription Payments
              </div>
              <Config style={{ flexDirection: "column" }} />
            </Card>
            <div style={{ width: "30px" }} />
            <SpendRate spendRate={spendRate} />
            {!compact && (
              <>
                <div style={{ width: "30px" }} />
                <MinBalance minBalance={minBalance} />
              </>
            )}
          </Space>
        </div>
      </div>
      <Payments
        refresh={handleRefresh}
        refreshPaymentsRef={refreshPaymentsRef}
      />
    </div>
  );
}
