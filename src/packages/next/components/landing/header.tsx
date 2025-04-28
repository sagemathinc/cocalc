/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Layout, Tooltip } from "antd";
import Link from "next/link";
import { join } from "path";

import { Icon } from "@cocalc/frontend/components/icon";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { SoftwareEnvNames } from "@cocalc/util/consts/software-envs";
import { COLORS } from "@cocalc/util/theme";
import AccountNavTab from "components/account/navtab";
import Analytics from "components/analytics";
import DemoCell from "components/demo-cell";
import LiveDemo from "components/landing/live-demo";
import Logo from "components/logo";
import A from "components/misc/A";
import ChatGPTHelp from "components/openai/chatgpt-help";
import basePath from "lib/base-path";
import { useCustomize } from "lib/customize";
import SubNav, { Page, SubPage } from "./sub-nav";

const GAP = "3%";

const SHOW_AI_CHAT: Readonly<string[]> = ["ai"] as const;

export const LinkStyle: React.CSSProperties = {
  color: "white",
  marginRight: GAP,
  display: "inline-block",
} as const;

// The style shouldn't change the size of the label, e.g., don't
// use bold.  Otherwise, everything moves a little when you select
// an option, which looks weird.
const SelectedStyle: React.CSSProperties = {
  ...LinkStyle,
  color: COLORS.LANDING.TOP_BG,
  borderBottom: "5px solid #c7d9f5",
} as const;

interface Props {
  page?: Page;
  subPage?: SubPage;
  runnableTag?: string; // if on cocalc.com and have jupyter api use this tag for a little runable editable demo Jupyter cell.
  softwareEnv?: SoftwareEnvNames;
}

export default function Header(props: Props) {
  const { page, subPage, softwareEnv, runnableTag } = props;
  const {
    siteName,
    termsOfServiceURL,
    account,
    onCoCalcCom,
    openaiEnabled,
    jupyterApiEnabled,
    enabledPages,
  } = useCustomize();

  if (basePath == null) return null;

  function ask() {
    if (onCoCalcCom && !IS_MOBILE) {
      return (
        <span
          style={{
            float: "right",
            width: "150px", // CRITICAL -- this is to prevent flicker -- see https://github.com/sagemathinc/cocalc/issues/6504
          }}
        >
          {true || account ? (
            <LiveDemo context="header" type="primary" />
          ) : (
            <Button
              type="primary"
              href="/support/new?type=question&subject=&body=&title=Ask%20Us%20Anything!"
            >
              <Icon name="question-circle" /> Contact
            </Button>
          )}
        </span>
      );
    }
  }

  return (
    <>
      <Analytics />
      <Layout.Header
        style={{
          minHeight: "64px",
          height: "auto",
          lineHeight: "32px",
          padding: "16px",
          textAlign: "center",
        }}
      >
        {ask()}
        <A href="/">
          {/* WARNING: This mess is all to support using the next/image component for the image via our Image component.  It's ugly. */}
          <div
            style={{
              position: "relative",
              display: "inline-block",
              top: "15px",
              height: "40px",
              width: "40px",
              marginTop: "-30px",
              marginRight: "64px",
            }}
          >
            <Logo
              type="icon"
              style={{
                height: "40px",
                width: "40px",
                position: "absolute",
              }}
            />
          </div>
        </A>
        {account && (
          <Tooltip title={"Browse all of your projects"}>
            <a style={LinkStyle} href={join(basePath, "projects")}>
              Your Projects
            </a>
          </Tooltip>
        )}
        {enabledPages?.store && (
          <A href="/store" style={page === "store" ? SelectedStyle : LinkStyle}>
            Store
          </A>
        )}
        {enabledPages?.features && (
          <A
            href="/features/"
            style={page === "features" ? SelectedStyle : LinkStyle}
          >
            Features
          </A>
        )}
        {/* supportedRoutes?.software && (
          <A
            href="/software"
            style={page == "software" ? SelectedStyle : LinkStyle}
          >
            Software
          </A>
        )*/}
        {enabledPages?.legal && (
          <A
            style={LinkStyle}
            href={termsOfServiceURL}
            title="View the terms of service and other legal documents."
          >
            Legal
          </A>
        )}
        {enabledPages?.info && (
          <A
            style={page === "info" ? SelectedStyle : LinkStyle}
            href="/info"
            title="Documentation and links to resources for learning more about CoCalc"
          >
            Docs
          </A>
        )}
        {enabledPages?.share && (
          <Link
            href={"/share/public_paths/page/1"}
            style={page === "share" ? SelectedStyle : LinkStyle}
            title="View files that people have published."
          >
            Share
          </Link>
        )}
        {enabledPages?.support && (
          <A
            style={page === "support" ? SelectedStyle : LinkStyle}
            href="/support"
            title="Create and view support tickets"
          >
            Support
          </A>
        )}
        {enabledPages?.news && (
          <A
            style={page === "news" ? SelectedStyle : LinkStyle}
            href="/news"
            title={`News about ${siteName}`}
          >
            News
          </A>
        )}
        {enabledPages?.about.index && (
          <A
            style={page === "about" ? SelectedStyle : LinkStyle}
            href="/about"
            title={`About ${siteName}`}
          >
            About
          </A>
        )}
        {enabledPages?.policies.index && (
          <A
            style={page === "policies" ? SelectedStyle : LinkStyle}
            href="/policies"
            title={`Policies of ${siteName}`}
          >
            Policies
          </A>
        )}
        {account ? (
          <AccountNavTab
            style={page === "account" ? SelectedStyle : LinkStyle}
          />
        ) : (
          <>
            <A
              style={page === "sign-up" ? SelectedStyle : LinkStyle}
              href="/auth/sign-up"
              title={`Sign up for a ${siteName} account.`}
            >
              Sign Up
            </A>
            <A
              style={page === "sign-in" ? SelectedStyle : LinkStyle}
              href="/auth/sign-in"
              title={`Sign in to ${siteName} or create an account.`}
            >
              Sign In
            </A>
          </>
        )}
        {enabledPages?.auth.try && (
          <A
            style={page === "try" ? SelectedStyle : LinkStyle}
            href={"/auth/try"}
            title={`Try ${siteName} immediately without creating an account.`}
          >
            Try
          </A>
        )}{" "}
      </Layout.Header>
      <SubNav page={page} subPage={subPage} softwareEnv={softwareEnv} />
      {openaiEnabled &&
      onCoCalcCom &&
      page === "features" &&
      typeof subPage === "string" &&
      SHOW_AI_CHAT.includes(subPage) ? (
        <div style={{ width: "700px", maxWidth: "100%", margin: "15px auto" }}>
          <ChatGPTHelp
            size="large"
            prompt={subPage ? `I am using ${subPage}.` : ""}
            tag={`features-${subPage}`}
          />
        </div>
      ) : undefined}
      {jupyterApiEnabled && onCoCalcCom && runnableTag ? (
        <DemoCell tag={runnableTag} />
      ) : undefined}
    </>
  );
}
