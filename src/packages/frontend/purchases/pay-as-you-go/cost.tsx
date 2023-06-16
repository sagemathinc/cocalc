/*
Render the cost of a pay-as-you-go service.

This gets the cost once via an api call, then uses the cached cost afterwards (until
user refreshes browser), since costs change VERY rarely.
*/

import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import LRU from "lru-cache";
import { useEffect, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Alert, Spin, Statistic, Table } from "antd";

const cache = new LRU<string, any>({
  max: 200,
});

interface Props {
  service: Service;
}

export default function Cost({ service }: Props) {
  const [cost, setCost] = useState<any>(cache.get(service));
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
    return (
      <Statistic
        title={"Minimum Credit"}
        value={cost}
        precision={2}
        prefix={"$"}
      />
    );
  }

  if (service.startsWith("openai-gpt")) {
    return (
      <OpenAiCost
        prompt_tokens={cost.prompt_tokens}
        completion_tokens={cost.completion_tokens}
      />
    );
  }

  return <pre>{JSON.stringify(cost)}</pre>;
}

function OpenAiCost({ prompt_tokens, completion_tokens }) {
  const inputPrice = (prompt_tokens * 1000).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const outputPrice = (completion_tokens * 1000).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

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

  return <Table columns={columns} dataSource={data} pagination={false} />;
}

function PriceWithToken({ text }) {
  return (
    <span>
      <span style={{ color: "#000" }}>{text.split(" ")[0]}</span>
      <span style={{ color: "#666" }}> / 1K tokens</span>
    </span>
  );
}
