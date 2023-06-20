/*
Render the cost of a pay-as-you-go service.

This gets the cost once via an api call, then uses the cached cost afterwards (until
user refreshes browser), since costs change VERY rarely.
*/

import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import LRU from "lru-cache";
import { useEffect, useState } from "react";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { Alert, Spin, Statistic, Table, Tooltip } from "antd";

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

  if (service == "project-upgrade") {
    return <ProjectUpgradeCost cost={cost} />;
  } else if (service.startsWith("openai-gpt")) {
    return (
      <OpenAiCost
        prompt_tokens={cost.prompt_tokens}
        completion_tokens={cost.completion_tokens}
      />
    );
  }

  return <pre>{JSON.stringify(cost)}</pre>;
}

function ProjectUpgradeCost({ cost }) {
  // cost is an object like this, where the amount is in dollars per month, except
  // the member host factor:
  // {"cores":50, "memory":7, "disk_quota":0.25, "member_host":4}

  // We convert to per hour pricing.
  const hours = 30.5 * 24;
  const cores = (cost.cores / hours).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const memory = (cost.memory / hours).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const disk_quota = cost.disk_quota.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  const columns = [
    {
      title: "Memory (GB)",
      dataIndex: "memory",
      key: "memory",
    },
    {
      title: "Disk Quota (GB)",
      dataIndex: "disk_quota",
      key: "disk_quota",
    },
    {
      title: "vCPU",
      dataIndex: "cores",
      key: "cores",
    },
    {
      title: "Member Hosting",
      dataIndex: "member_host",
      key: "member_host",
    },
  ];

  const data = [
    {
      cores: <PricePerUnit value={cores} unit="hour" month={cost.cores} />,
      memory: <PricePerUnit value={memory} unit="hour" month={cost.memory} />,
      disk_quota: <PricePerUnit value={disk_quota} unit="month " />,
      member_host: (
        <span>
          {Math.round(100 * (1 - 1 / cost.member_host))}%{" "}
          <span style={{ color: "#666" }}>non-member discount</span>
        </span>
      ),
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

function PricePerUnit({ value, unit, month }: { value; unit; month? }) {
  const body = (
    <span>
      <span style={{ color: "#000" }}>{value}</span>
      <span style={{ color: "#666" }}> / {unit}</span>
    </span>
  );
  if (month) {
    const cost = month.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
    return <Tooltip title={`${cost} per month`}>{body}</Tooltip>;
  }
  return body;
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
