/*
Render the cost of a pay-as-you-go service.

This gets the cost once via an api call, then uses the cached cost afterwards (until
user refreshes browser), since costs change VERY rarely.
*/
import { Alert, Spin } from "antd";
import LRU from "lru-cache";
import { useEffect, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import MoneyStatistic from "../money-statistic";

const cache = new LRU<string, any>({
  max: 200,
});

interface Props {
  service: Service;
  inline?: boolean; // just show minimal cost desc.
  cost?: any;
}

export default function Cost({ service, cost: cost0 }: Props) {
  const [cost, setCost] = useState<any>(cost0 ?? cache.get(service));
  const [error, setError] = useState<string>("");

  const getCost = async () => {
    try {
      const cost = await webapp_client.purchases_client.getServiceCost(service);
      cache.set(service, cost);
      setCost(cost);
    } catch (err) {
      setError(`${err}`);
    }
  };
  useEffect(() => {
    if (cost == null) {
      getCost();
    }
  }, []);

  if (error) {
    return <Alert type="error" description={error} />;
  }
  if (cost == null) {
    return <Spin delay={1000} />;
  }

  if (service == "credit") {
    return <MoneyStatistic title={"Minimum Credit"} value={cost} />;
  }

  return <pre>{JSON.stringify(cost)}</pre>;
}
