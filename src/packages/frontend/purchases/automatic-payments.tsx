/* Status of your purchases

This is your balance, limit and spending rate.
*/

import { Card, Space } from "antd";
import MinBalance from "./min-balance";
import SpendRate from "./spend-rate";
import { useEffect, useState } from "react";
import {
  getMinBalance as getMinBalanceUsingApi,
  getSpendRate as getSpendRateUsingApi,
} from "./api";
import Config from "./config";
import ShowError from "@cocalc/frontend/components/error";
import { SectionDivider } from "./util";
import AutoBalance from "./auto-balance";

const MAX_WIDTH = "900px";

export default function AutomaticPayments({
  compact,
  style,
}: {
  compact?;
  style?;
}) {
  const [loading, setLoading] = useState<boolean>(true);
  const [minBalance, setMinBalance] = useState<number | null>(null);
  const [error, setError] = useState<string>("");
  const [spendRate, setSpendRate] = useState<number | null>(null);

  const getSpendRate = async () => {
    setSpendRate(await getSpendRateUsingApi());
  };
  const getMinBalance = async () => {
    setMinBalance(await getMinBalanceUsingApi());
  };

  const handleRefresh = async () => {
    try {
      setError("");
      setLoading(true);
      setMinBalance(null);
      setSpendRate(null);
      await Promise.all([getSpendRate(), getMinBalance()]);
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
      <SectionDivider onRefresh={handleRefresh} loading={loading}>
        Automatic Payments
      </SectionDivider>
      <ShowError
        error={error}
        setError={setError}
        style={{ marginBottom: "15px" }}
      />
      <div style={{ textAlign: "center", margin: "15px 0" }}>
        <AutoBalance />
      </div>
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
    </div>
  );
}
