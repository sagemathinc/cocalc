/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Avatar, Space, Tooltip, Typography } from "antd";
import { useRouter } from "next/router";
import { join } from "path";
import { CSSProperties, ReactNode, useMemo } from "react";

import { Icon } from "@cocalc/frontend/components/icon";
import { checkRequiredSSO } from "@cocalc/server/auth/sso/check-required-sso";
import { PRIMARY_SSO } from "@cocalc/util/types/passport-types";
import { Strategy } from "@cocalc/util/types/sso";
import Loading from "components/share/loading";
import basePath from "lib/base-path";
import { useCustomize } from "lib/customize";

const { Link: AntdLink } = Typography;

import styles from "./sso.module.css";

interface SSOProps {
  size?: number;
  style?: CSSProperties;
  header?: ReactNode;
  showAll?: boolean;
  showName?: boolean;
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
  const { size = 60, style, header, showAll = false, showName = false } = props;
  const { strategies } = useCustomize();
  const ssoHREF = useSSOHref("sso");

  const havePrivateSSO: boolean = useMemo(() => {
    return showAll ? false : strategies?.some((s) => !s.public) ?? false;
  }, [strategies]);

  if (strategies == null) {
    return <Loading style={{ fontSize: "16pt" }} />;
  }

  if (strategies.length == 0) return <></>;

  function renderPrivateSSO() {
    if (!havePrivateSSO) return;

    // a fake entry to point the user to the page for private SSO login options
    const sso: Strategy = {
      name: "sso",
      display: "institutional Single Sign-On",
      icon: "api",
      backgroundColor: "",
      public: true,
      exclusiveDomains: [],
      doNotHide: true,
    };

    return (
      <div style={{ marginLeft: "-5px", marginTop: "10px" }}>
        <a href={ssoHREF}>
          {"Institutional Single Sign-On: "}
          <StrategyAvatar key={"sso"} strategy={sso} size={size} />
        </a>
      </div>
    );
  }

  function renderStrategies() {
    if (strategies == null) return;
    const s = strategies
      .filter((s) => showAll || s.public || s.doNotHide)
      .map((strategy) => {
        return (
          <StrategyAvatar
            key={strategy.name}
            strategy={strategy}
            size={size}
            showName={showName}
          />
        );
      });
    return (
      <div style={{ marginLeft: "-5px", textAlign: "center" }}>
        {showName ? <Space wrap>{s}</Space> : s}
      </div>
    );
  }

  // The -5px is to offset the initial avatar image, since they
  // all have a left margin.
  return (
    <div style={{ ...style }}>
      {header}
      {renderStrategies()}
      {renderPrivateSSO()}
    </div>
  );
}

function useSSOHref(name?: string) {
  const router = useRouter();
  if (name == null) return "";
  return getLink(name, join(router.basePath, router.pathname));
}

interface AvatarProps {
  strategy: Pick<Strategy, "name" | "display" | "icon" | "backgroundColor">;
  size: number;
  noLink?: boolean;
  toolTip?: ReactNode;
  showName?: boolean;
}

export function StrategyAvatar(props: AvatarProps) {
  const { strategy, size, noLink, toolTip, showName = false } = props;
  const { name, display, backgroundColor } = strategy;
  const icon = iconName();
  const ssoHREF = useSSOHref(name);

  const STYLE: CSSProperties = {
    fontSize: `${size - 2}px`,
    color: backgroundColor ? "white" : "black",
    margin: "0 2px",
  } as const;

  // this derives the name of the icon, that's shown on the avatar
  // in particular, the old public SSO mechanisms are special cases.
  function iconName(): string {
    // icon could be "null"
    if (strategy.icon != null) return strategy.icon;
    if ((PRIMARY_SSO as readonly string[]).includes(strategy.name)) {
      return strategy.name;
    }
    return "link"; // a chain link, very general fallback
  }

  function renderIconImg() {
    if (icon?.includes("://")) {
      return (
        <img
          src={icon}
          style={{
            height: `${size - 2}px`,
            width: `${size - 2}px`,
            objectFit: "contain",
          }}
        />
      );
    } else {
      return <Icon name={icon as any} style={{ ...STYLE, backgroundColor }} />;
    }
  }

  function renderAvatar() {
    const avatar = (
      <Avatar
        shape="square"
        size={size}
        src={renderIconImg()}
        gap={1}
        className={styles.icon}
      />
    );

    if (noLink) {
      return avatar;
    } else {
      return <a href={ssoHREF}>{avatar}</a>;
    }
  }

  function renderIcon() {
    if (icon?.includes("://")) return "";
    return (
      <Icon
        name={icon as any}
        style={{ fontSize: "14pt", marginRight: "10px" }}
      />
    );
  }

  function renderName() {
    if (!showName) return;
    return (
      <div style={{ textAlign: "center", whiteSpace: "nowrap" }}>{display}</div>
    );
  }

  return (
    <Tooltip
      title={
        <>
          {renderIcon()} {toolTip ?? <>Use your {display} account.</>}
        </>
      }
      color={backgroundColor}
    >
      <div style={{ display: "inline-block" }}>
        {renderAvatar()}
        {renderName()}
      </div>
    </Tooltip>
  );
}

export function RequiredSSO({ strategy }: { strategy?: Strategy }) {
  if (strategy == null) return null;
  if (strategy.name == "null")
    return <Alert type="error" message={"SSO Strategy not defined!"} />;
  const ssoLink = join(basePath, "sso", strategy.name);
  return (
    <Alert
      style={{ margin: "15px 0" }}
      type="warning"
      showIcon={false}
      message={`Single Sign-On required`}
      description={
        <>
          <p>
            You must sign up using the{" "}
            <AntdLink strong underline href={ssoLink}>
              {strategy.display}
            </AntdLink>{" "}
            Single Sign-On strategy.
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
  email: string | undefined,
): Strategy | undefined {
  return useMemo(() => {
    return checkRequiredSSO({ email, strategies });
  }, [strategies == null, email]);
}
