/*
Render the cost of a pay-as-you-go service.

This gets the cost once via an api call, then uses the cached cost afterwards (until
user refreshes browser), since costs change VERY rarely.
*/
import { Alert, Spin, Table, Tooltip } from "antd";
import LRU from "lru-cache";
import { useEffect, useState } from "react";
import { getGoogleCloudPriceData } from "@cocalc/frontend/compute/api";
import { A } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { isLanguageModelService } from "@cocalc/util/db-schema/llm-utils";
import type { Service } from "@cocalc/util/db-schema/purchase-quotas";
import { currency } from "@cocalc/util/misc";
import MoneyStatistic from "../money-statistic";

const cache = new LRU<string, any>({
  max: 200,
});

interface Props {
  service: Service;
  inline?: boolean; // just show minimal cost desc.
  cost?: any;
}

export default function Cost({ inline, service, cost: cost0 }: Props) {
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

  if (service == "project-upgrade") {
    return <ProjectUpgradeCost cost={cost} />;
  } else if (isLanguageModelService(service)) {
    return (
      <LLMServiceCost
        prompt_tokens={cost.prompt_tokens}
        completion_tokens={cost.completion_tokens}
      />
    );
  } else if (service == "edit-license") {
    return (
      <div style={TEXT_STYLE}>
        The prorated difference between the cost of the original license and the
        edited one.
      </div>
    );
  } else if (service == "compute-server") {
    return (
      <div style={TEXT_STYLE}>
        Competitive pay-as-you-go pricing depending on cloud rates and compute
        server configuration. Pay by the second while the compute server is
        provisioned. When your spend approaches this limit, your compute servers
        are turned off, but the disk is not immediately deleted (unless you
        significantly exceed the limit).
      </div>
    );
  } else if (service == "compute-server-network-usage") {
    if (inline) {
      return <GoogleNetworkCost markup={cost} />;
    }
    return (
      <div style={TEXT_STYLE}>
        <GoogleNetworkCost markup={cost} />
      </div>
    );
  } else if (service == "compute-server-storage") {
    if (inline) {
      return <CloudStorageCost markup={cost} />;
    }
    return (
      <div style={TEXT_STYLE}>
        <CloudStorageCost markup={cost} />
      </div>
    );
  }

  return <pre>{JSON.stringify(cost)}</pre>;
}

const TEXT_STYLE = { maxWidth: "400px", margin: "auto" } as const;

function ProjectUpgradeCost({ cost }) {
  // cost is an object like this, where the amount is in dollars per month, except
  // the member host factor:
  // {"cores":50, "memory":7, "disk_quota":0.25, "member_host":4}

  // We convert to per hour pricing.
  const hours = 30.5 * 24;
  const cores = currency(cost.cores / hours, 3);
  const memory = currency(cost.memory / hours, 3);
  const disk_quota = currency(cost.disk_quota, 3);

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
      input: "key",
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

function LLMServiceCost({ prompt_tokens, completion_tokens }) {
  const inputPrice = currency(prompt_tokens * 1000, 3);
  const outputPrice = currency(completion_tokens * 1000, 3);
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

function useMarkup(markup0) {
  const [markup, setMarkup] = useState<number | undefined>(markup0);
  useEffect(() => {
    if (markup == null) {
      (async () => {
        try {
          setMarkup((await getGoogleCloudPriceData()).markup);
        } catch (err) {
          console.log(err);
        }
      })();
    }
  }, []);
}

export function GoogleNetworkCost({ markup: markup0 }: { markup?: number }) {
  // the passed in cost is the markup
  const markup = useMarkup(markup0);
  return (
    <>
      Network pricing is a {markup != null ? `${markup}%` : "small"} markup
      on exactly what{" "}
      <A href="https://cloud.google.com/vpc/network-pricing">
        Google charges for network usage.
      </A>{" "}
      It can take up to 3 days for networking charges to be reported.
    </>
  );
}

export function CloudStorageCost({ markup: markup0 }: { markup?: number }) {
  const markup = useMarkup(markup0);
  return (
    <>
      Cloud storage pricing is a {markup != null ? `${markup}%` : "small"}{" "}
      markup on exactly what{" "}
      <A href="https://cloud.google.com/storage/pricing">
        Google charges for Google Cloud Storage usage.
      </A>{" "}
    </>
  );
}
