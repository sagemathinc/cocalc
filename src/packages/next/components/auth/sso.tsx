import { Avatar, Tooltip } from "antd";
import { CSSProperties } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import basePath from "lib/base-path";
import { join } from "path";

interface Strategy {
  name: string;
  display: string;
  icon: string;
  backgroundColor?: string;
}

interface Props {
  strategies?: Strategy[];
  size?: number;
}

export function getLink(strategy: string): string {
  return join(basePath, "auth", strategy);
}

export default function SSO({ strategies, size }: Props) {
  if (!strategies) return <></>;
  return (
    <div>
      {strategies.map((strategy) => (
        <StrategyAvatar key={strategy.name} strategy={strategy} size={size ?? 60} />
      ))}
    </div>
  );
}

function StrategyAvatar({
  strategy,
  size,
}: {
  strategy: Strategy;
  size: number;
}) {
  const STYLE = {
    fontSize: `${size - 2}px`,
    color: "white",
    margin: "0 2px",
  } as CSSProperties;
  const { name, display, icon, backgroundColor } = strategy;
  let src;
  if (icon.includes("://")) {
    src = (
      <img
        src={icon}
        style={{
          height: `${size - 2}px`,
          width: `${size - 2}px`,
          marginLeft: "2.5px",
        }}
      />
    );
  } else {
    src = <Icon name={icon as any} style={{ ...STYLE, backgroundColor }} />;
  }
  return (
    <Tooltip
      title={
        <>
          {icon.includes("://") ? (
            ""
          ) : (
            <Icon
              name={icon as any}
              style={{ fontSize: "14pt", marginRight: "10px" }}
            />
          )}{" "}
          Use your {display} account.
        </>
      }
      color={backgroundColor}
    >
      <a href={getLink(name)} style={{ margin: "0 2.5px" }}>
        <Avatar shape="square" size={size} src={src} gap={1} />
      </a>
    </Tooltip>
  );
}
