/*
Render the cost of a pay-as-you-go service.

This gets the cost once via an api call, then uses the cached cost afterwards (until
user refreshes browser), since costs change VERY rarely.
*/
import { Alert, Spin, Table } from "antd";
import LRU from "lru-cache";
import { useEffect, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { isLanguageModelService } from "@cocalc/util/db-schema/llm-utils";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import { currency } from "@cocalc/util/misc";
import { toDecimal } from "@cocalc/util/money";
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

  if (isLanguageModelService(service)) {
    return (
      <LLMServiceCost
        prompt_tokens={cost.prompt_tokens}
        completion_tokens={cost.completion_tokens}
      />
    );
  }
  return <pre>{JSON.stringify(cost)}</pre>;
}

function LLMServiceCost({ prompt_tokens, completion_tokens }) {
  const inputPrice = currency(
    toDecimal(prompt_tokens).mul(1000).toNumber(),
    3,
  );
  const outputPrice = currency(
    toDecimal(completion_tokens).mul(1000).toNumber(),
    3,
  );
  const columns = [
    {
      title: "Input",
      dataIndex: "input",
      key: "input",
      render: (text) => <PriceWithToken text={text} />,
    },
    {
      title: "Output",
      dataIndex: "output",
      key: "output",
      render: (text) => <PriceWithToken text={text} />,
    },
  ];
  const data = [
    {
      input: `${inputPrice} / 1K tokens`,
      output: `${outputPrice} / 1K tokens`,
    },
  ];
  return (
    <Table
      rowKey={"input"}
      columns={columns}
      dataSource={data}
      pagination={false}
    />
  );
}

function PriceWithToken({ text }) {
  return (
    <span>
      <span style={{ color: "#000" }}>{text.split(" ")[0]}</span>
      <span style={{ color: "#666" }}> / 1K tokens</span>
    </span>
  );
}
