/* Status of your purchases

This is your balance, limit and spending rate.
*/

import { Icon } from "@cocalc/frontend/components/icon";
import { Alert, Button, Space } from "antd";
import { SettingBox } from "@cocalc/frontend/components/setting-box";
import MinBalance from "./min-balance";
import Balance from "./balance";
import SpendRate from "./spend-rate";
import { useEffect, useState } from "react";
import {
  getBalance as getBalanceUsingApi,
  getPendingBalance as getPendingBalanceUsingApi,
  getMinBalance as getMinBalanceUsingApi,
  getSpendRate as getSpendRateUsingApi,
} from "./api";

export default function AccountStatus() {
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

  const handleRefresh = async () => {
    try {
      setLoading(true);
      setBalance(null);
      setPendingBalance(null);
      setMinBalance(null);
      setSpendRate(null);
      setError("");
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
    <SettingBox
      icon="dashboard"
      title={
        <span style={{ marginLeft: "5px" }}>
          Balance
          <Button
            onClick={handleRefresh}
            disabled={loading}
            style={{ marginLeft: "30px" }}
          >
            <Icon name="refresh" />
            Refresh
          </Button>
        </span>
      }
    >
      {error && (
        <Alert
          type="error"
          description={error}
          style={{ marginBottom: "15px" }}
        />
      )}
      <div style={{ textAlign: "center" }}>
        <Space style={{ margin: "auto", alignItems: "flex-start" }}>
          <Balance
            balance={balance}
            pendingBalance={pendingBalance}
            refresh={handleRefresh}
          />
          <div style={{ width: "30px" }} />
          <MinBalance minBalance={minBalance} />
          <div style={{ width: "30px" }} />
          <SpendRate spendRate={spendRate} />
        </Space>
      </div>
    </SettingBox>
  );
}
