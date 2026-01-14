/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { useRouter } from "next/router";

import { Icon } from "@cocalc/frontend/components/icon";
import { Uptime } from "@cocalc/util/consts/site-license";

export interface StoreConf {
  run_limit: number;
  disk: number;
  ram: number;
  cpu: number;
  user: "academic" | "business";
  start?: Date;
  end?: Date;
  uptime: Uptime;
  period?: "monthly" | "yearly" | "range";
}

interface Props {
  conf?: StoreConf;
}

const STYLE: React.CSSProperties = {
  fontSize: "150%",
  fontWeight: "bold",
  textAlign: "center",
  marginTop: "30px",
} as const;

export function LinkToStore(props: Props) {
  const { conf } = props;

  const router = useRouter();

  const url = "/store/membership";

  const label = conf != null ? "Select" : `Store`;

  return (
    <div style={STYLE}>
      <Button
        size={"large"}
        type={"primary"}
        onClick={() => router.push(url)}
        icon={<Icon name="shopping-cart" />}
      >
        {label}
      </Button>
    </div>
  );
}
