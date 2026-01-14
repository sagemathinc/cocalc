/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button } from "antd";
import { useRouter } from "next/router";

import { Icon } from "@cocalc/frontend/components/icon";

interface Props {
  label?: string;
}

const STYLE: React.CSSProperties = {
  fontSize: "150%",
  fontWeight: "bold",
  textAlign: "center",
  marginTop: "30px",
} as const;

export function LinkToStore({ label }: Props) {
  const router = useRouter();

  return (
    <div style={STYLE}>
      <Button
        size="large"
        type="primary"
        onClick={() => router.push("/store/membership")}
        icon={<Icon name="shopping-cart" />}
      >
        {label ?? "Store"}
      </Button>
    </div>
  );
}
