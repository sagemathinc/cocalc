import api from "@cocalc/frontend/client/api";
import { useEffect, useState } from "react";
import { Spin, Tooltip } from "antd";
import { currency, round2 } from "@cocalc/util/misc";
import { TimeAgo } from "@cocalc/frontend/components";

export default function Money({ account_id }) {
  const [data, setData] = useState<{
    cocalc_purchase_timestamp: string;
    cocalc_balance: number;
    cocalc_last_month_spend: number;
    cocalc_last_year_spend: number;
  } | null>(null);

  useEffect(() => {
    (async () => {
      setData(await api("salesloft/money", { account_id }));
    })();
  }, []);

  if (data == null) {
    return <Spin />;
  }

  if (
    data.cocalc_last_year_spend == 0 &&
    data.cocalc_last_month_spend == 0 &&
    data.cocalc_balance == 0
  ) {
    return <div>Not A Recent Paying Customer</div>;
  }

  return (
    <div>
      <Tooltip title="These are potentially stale estimates!">
        <b>Quick estimates</b>
      </Tooltip>{" "}
      -- Balance: {currency(round2(data.cocalc_balance))}, Last Month Spend:{" "}
      {currency(round2(data.cocalc_last_month_spend))}, Last Year Spend:{" "}
      {currency(round2(data.cocalc_last_year_spend))}, Last Daily Statement:{" "}
      <TimeAgo date={new Date(data.cocalc_purchase_timestamp)} />{" "}
    </div>
  );
}
