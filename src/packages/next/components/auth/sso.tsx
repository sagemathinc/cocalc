import { Avatar, Tooltip } from "antd";
import { CSSProperties, ReactNode } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import basePath from "lib/base-path";
import { join } from "path";
import { useRouter } from 'next/router'

export interface Strategy {
  name: string;
  display: string;
  icon: string;
  backgroundColor?: string;
}

interface Props {
  strategies?: Strategy[];
  size?: number;
}

export function getLink(strategy: string, target?: string): string {
  // TODO: the target is ignored by the server right now -- it's not implemented
  // and I don't know how... yet.  Code is currently in src/packages/hub/auth.ts
  return `${join(basePath, "auth", strategy)}${
    target ? "?target=" + encodeURIComponent(target) : ""
  }`;
}

export default function SSO({ strategies, size }: Props) {
  if (!strategies) return <></>;
  return (
    <div>
      {strategies.map((strategy) => (
        <StrategyAvatar
          key={strategy.name}
          strategy={strategy}
          size={size ?? 60}
        />
      ))}
    </div>
  );
}

export function StrategyAvatar({
  strategy,
  size,
  noLink,
  toolTip,
}: {
  strategy: Strategy;
  size: number;
  noLink?: boolean;
  toolTip?: ReactNode;
}) {
  const router = useRouter();

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
  const avatar = <Avatar shape="square" size={size} src={src} gap={1} />;

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
          {toolTip ?? <>Use your {display} account.</>}
        </>
      }
      color={backgroundColor}
    >
      {noLink ? (
        avatar
      ) : (
        <a
          href={getLink(name, join(router.basePath, router.pathname))}
          style={{ margin: "0 2.5px", cursor: "pointer" }}
        >
          {avatar}
        </a>
      )}
    </Tooltip>
  );
}
