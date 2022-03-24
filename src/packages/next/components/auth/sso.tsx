import { Avatar, Tooltip } from "antd";
import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";
import { Icon } from "@cocalc/frontend/components/icon";
import basePath from "lib/base-path";
import { join } from "path";
import { useRouter } from "next/router";
import apiPost from "lib/api/post";
import Loading from "components/share/loading";
import { Strategy } from "@cocalc/util/types/sso";

interface SSOProps {
  strategies?: Strategy[];
  size?: number;
  style?: CSSProperties;
  header?: ReactNode;
}

export function getLink(strategy: string, target?: string): string {
  // special case: private SSO mechanism, we point to the overview page
  if (strategy === "sso") {
    return `${join(basePath, "sso")}`;
  }
  // TODO: the target is ignored by the server right now -- it's not implemented
  // and I don't know how... yet.  Code is currently in src/packages/hub/auth.ts
  return `${join(basePath, "auth", strategy)}${
    target ? "?target=" + encodeURIComponent(target) : ""
  }`;
}

export default function SSO(props: SSOProps) {
  const { strategies, size, style, header } = props;

  const [strategies2, setStrategies2] = useState<Strategy[] | undefined>(
    strategies
  );

  useEffect(() => {
    if (strategies2 === undefined) {
      (async () => {
        try {
          setStrategies2(await apiPost("/auth/sso-strategies"));
        } catch (_err) {}
      })();
    }
  }, []);

  const havePrivateSSO: boolean = useMemo(() => {
    return strategies2?.some((s) => !s.public) ?? false;
  }, [strategies2]);

  if (strategies2 === undefined) {
    return <Loading style={{ fontSize: "16pt" }} />;
  }

  if (strategies2.length == 0) return <></>;

  function renderPrivateSSO() {
    if (!havePrivateSSO) return;

    // a fake entry to point the user to the page for private SSO login options
    const sso = {
      name: "sso",
      display: "Single Sing On",
      icon: "api",
      backgroundColor: "",
      public: true,
    };

    return (
      <>
        {"External sinle-sign-on: "}
        <StrategyAvatar key={"sso"} strategy={sso} size={size ?? 60} />
      </>
    );
  }

  function renderStrategies() {
    if (strategies2 == null) return;
    return strategies2
      .filter((s) => s.public)
      .map((strategy) => (
        <StrategyAvatar
          key={strategy.name}
          strategy={strategy}
          size={size ?? 60}
        />
      ));
  }

  // The -5px is to offset the initial avatar image, since they
  // all have a left margin.
  return (
    <div style={{ ...style }}>
      {header}
      <div style={{ marginLeft: "-5px" }}>{renderStrategies()}</div>
      <div style={{ marginLeft: "-5px", marginTop: "10px" }}>
        {renderPrivateSSO()}
      </div>
    </div>
  );
}

interface AvatarProps {
  strategy: Strategy;
  size: number;
  noLink?: boolean;
  toolTip?: ReactNode;
}

export function StrategyAvatar(props: AvatarProps) {
  const { strategy, size, noLink, toolTip } = props;
  const router = useRouter();
  const { name, display, icon, backgroundColor } = strategy;

  const STYLE = {
    fontSize: `${size - 2}px`,
    color: backgroundColor ? "white" : "black",
    margin: "0 2px",
  } as CSSProperties;

  const iconImg = icon.includes("://") ? (
    <img
      src={icon}
      style={{
        height: `${size - 2}px`,
        width: `${size - 2}px`,
        marginLeft: "2.5px",
      }}
    />
  ) : (
    <Icon name={icon as any} style={{ ...STYLE, backgroundColor }} />
  );

  const avatar = <Avatar shape="square" size={size} src={iconImg} gap={1} />;

  function renderAvatar() {
    if (noLink) {
      return avatar;
    } else {
      return (
        <a
          href={getLink(name, join(router.basePath, router.pathname))}
          style={{ margin: "0 2.5px", cursor: "pointer" }}
        >
          {avatar}
        </a>
      );
    }
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
          {toolTip ?? <>Use your {display} account.</>}
        </>
      }
      color={backgroundColor}
    >
      {renderAvatar()}
    </Tooltip>
  );
}
