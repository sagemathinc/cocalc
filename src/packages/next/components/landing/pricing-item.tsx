import { ReactNode } from "react";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { Card, List } from "antd";

interface Props {
  children: ReactNode;
  icon: IconName;
  title: string;
}

export default function PricingItem({ icon, children, title }: Props) {
  return (
    <List.Item>
      <Card
        headStyle={{ backgroundColor: "#d9edf7" }}
        style={{ color: "#777" }}
        type="inner"
        title={
          <>
            <Icon name={icon} style={{ marginRight: "10px" }} />{" "}
            <strong>{title}</strong>
          </>
        }
      >
        {children}
      </Card>
    </List.Item>
  );
}

const STYLE = { marginRight: "5px", display: "inline-block", color: "#555" };

export function Line({
  amount,
  desc,
}: {
  amount?: string | number;
  desc?: string;
}) {
  if (!amount)
    return (
      <div>
        ---<b style={STYLE}>&nbsp;</b>
      </div>
    );

  let unit = "";
  if (desc?.includes("RAM") || desc?.includes("Disk")) {
    unit = "G";
  } else if (desc?.includes("CPU")) {
    unit = amount == 1 ? "core" : "cores";
  } else if (desc?.includes("Projects")) {
    unit = "simultaneous running";
  }
  return (
    <div>
      <b style={STYLE}>
        {amount} {unit}
      </b>{" "}
      {desc}
    </div>
  );
}
