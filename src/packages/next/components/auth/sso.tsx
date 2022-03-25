import { Icon } from "@cocalc/frontend/components/icon";
import { Strategy } from "@cocalc/util/types/sso";
import { Alert, Avatar, Tooltip, Typography } from "antd";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import basePath from "lib/base-path";
import { useRouter } from "next/router";
import { join } from "path";
import { CSSProperties, ReactNode, useEffect, useMemo, useState } from "react";

const { Link: AntdLink } = Typography;

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
    const sso: Strategy = {
      name: "sso",
      display: "Single-Sign-On",
      icon: "api",
      backgroundColor: "",
      public: true,
      exclusiveDomains: [],
      doNotHide: true,
    };

    return (
      <>
        {"External Single-Sign-On: "}
        <StrategyAvatar key={"sso"} strategy={sso} size={size ?? 60} />
      </>
    );
  }

  function renderStrategies() {
    if (strategies2 == null) return;
    return strategies2
      .filter((s) => s.public || s.doNotHide)
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
  strategy: Pick<Strategy, "name" | "display" | "icon" | "backgroundColor">;
  size: number;
  noLink?: boolean;
  toolTip?: ReactNode;
}

export function StrategyAvatar(props: AvatarProps) {
  const { strategy, size, noLink, toolTip } = props;
  const { name, display, backgroundColor } = strategy;
  const icon = strategy.icon ?? "link"; // icon could be "null", hence the ??
  const ssoHREF = useSSOHref(name);

  const STYLE = {
    fontSize: `${size - 2}px`,
    color: backgroundColor ? "white" : "black",
    margin: "0 2px",
  } as CSSProperties;

  const iconImg = icon?.includes("://") ? (
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
        <a href={ssoHREF} style={{ margin: "0 2.5px", cursor: "pointer" }}>
          {avatar}
        </a>
      );
    }
  }

  return (
    <Tooltip
      title={
        <>
          {icon?.includes("://") ? (
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

function useSSOHref(name?: string) {
  const router = useRouter();
  if (name == null) return "";
  return getLink(name, join(router.basePath, router.pathname));
}

export function RequiredSSO({ strategy }: { strategy?: Strategy }) {
  const ssoHREF = useSSOHref(strategy?.name);
  if (strategy == null) return null;
  return (
    <Alert
      style={{ margin: "15px 0" }}
      type="warning"
      showIcon={false}
      message={`Single-Sign-On required`}
      description={
        <>
          <p>
            You must sign up using the{" "}
            <AntdLink strong underline href={ssoHREF}>
              {strategy.display}
            </AntdLink>{" "}
            Single-Sign-On strategy.
          </p>
          <p style={{ textAlign: "center" }}>
            <StrategyAvatar
              key={strategy.name}
              strategy={strategy}
              size={120}
            />
          </p>
        </>
      }
    />
  );
}

// based on (partially) entered email address.
// if user has to sign up via SSO, this will tell which strategy to use.
// this also checks for subdomains via a simple heuristic – the precise test is on the backend.
// hence this should be good enough to catch @email.foo.edu for foo.edu domains
export function useRequiredSSO(
  strategies: Strategy[] | undefined,
  email: string | undefined
): Strategy | undefined {
  return useMemo(() => {
    // if the domain of email is contained in any of the strategie's exclusiveDomain array, return that strategy's name
    if (email == null) return;
    if (strategies == null || strategies.length === 0) return;
    if (email.indexOf("@") === -1) return;
    const emailDomain = email.trim().toLowerCase().split("@")[1];
    if (!emailDomain) return;
    for (const strategy of strategies) {
      for (const ssoDomain of strategy.exclusiveDomains) {
        if (emailDomain === ssoDomain || emailDomain.endsWith(`.${ssoDomain}`))
          return strategy;
      }
    }
  }, [strategies == null, email]);
}
