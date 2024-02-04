/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Flex, Layout } from "antd";
import Link from "next/link";
import { join } from "path";

import { Icon } from "@cocalc/frontend/components/icon";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { SoftwareEnvNames } from "@cocalc/util/consts/software-envs";
import { COLORS } from "@cocalc/util/theme";
import AccountNavTab from "components/account/navtab";
import Analytics from "components/analytics";
import DemoCell from "components/demo-cell";
import Logo from "components/logo";
import A from "components/misc/A";
import ChatGPTHelp from "components/openai/chatgpt-help";
import basePath from "lib/base-path";
import { useCustomize } from "lib/customize";
import SubNav, { Page, SubPage } from "./sub-nav";

const GAP = "4%";

export const NAVBAR_HEIGHT_PX = 52;

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
    isCommercial,
    anonymousSignup,
    siteName,
    termsOfServiceURL,
    shareServer,
    landingPages,
    account,
    onCoCalcCom,
    openaiEnabled,
    jupyterApiEnabled,
  } = useCustomize();

  if (basePath == null) return null;

  function ask() {
    if (onCoCalcCom && !IS_MOBILE) {
      return (
        <span
          style={{
            float: "right",
            right: 15,
            top: 25,
            color: "white",
            backgroundColor: COLORS.BLUE_D,
            outline: `1px solid ${COLORS.BLUE_DD}`,
            padding: "2px 8px",
            borderRadius: "5px",
            width: "100px", // CRITICAL -- this is to prevent flicker -- see https://github.com/sagemathinc/cocalc/issues/6504
          }}
        >
          <A
            type="primary"
            size="large"
            href="/support/new?type=question&subject=&body=&title=Ask%20Us%20Anything!"
            title="Ask a question"
            style={{
              color: "white",
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <Icon style={{ fontSize: "20px" }} name="question-circle" />{" "}
            <div>Contact</div>
          </A>
        </span>
      );
    }
  }

  return (
    <>
      <Analytics />
      <Layout.Header
        style={{
          lineHeight: "32px",
          padding: "8px",
          textAlign: "center",
          minHeight: `${NAVBAR_HEIGHT_PX}px`,
          height: "auto",
          // height: `${NAVBAR_HEIGHT_PX}px`,
          // position: "sticky",
          // top: 0,
          // zIndex: 1,
          width: "100%",
        }}
      >
        <Flex justify="space-around" >
          <Flex
            gap="middle"
            justify="space-between"
            wrap="wrap"
            style={{
              width: "100%",
            }}
          >
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
              <a
                style={LinkStyle}
                href={join(basePath, "projects")}
                title={"View your projects"}
              >
                Your Projects
              </a>
            )}
            {landingPages && (
              <>
                {isCommercial && (
                  <>
                    <A
                      href="/store"
                      style={page == "store" ? SelectedStyle : LinkStyle}
                    >
                      Store
                    </A>
                    <A
                      href="/pricing"
                      style={page == "pricing" ? SelectedStyle : LinkStyle}
                    >
                      Pricing
                    </A>
                  </>
                )}
                <A
                  href="/features/"
                  style={page == "features" ? SelectedStyle : LinkStyle}
                >
                  Features
                </A>
              </>
            )}
            {!landingPages && termsOfServiceURL && (
              <A
                style={LinkStyle}
                href={termsOfServiceURL}
                title="View the terms of service and other legal documents."
              >
                Legal
              </A>
            )}
            <A
              style={page == "info" ? SelectedStyle : LinkStyle}
              href="/info"
              title="Documentation and links to resources for learning more about CoCalc"
            >
              Docs
            </A>
            {shareServer && (
              <Link
                href={"/share/public_paths/page/1"}
                style={page == "share" ? SelectedStyle : LinkStyle}
                title="View files that people have published."
              >
                Share
              </Link>
            )}
            <A
              style={page == "support" ? SelectedStyle : LinkStyle}
              href="/support"
              title="Create and view support tickets"
            >
              Support
            </A>{" "}
            <A
              style={page == "news" ? SelectedStyle : LinkStyle}
              href="/news"
              title={`News about ${siteName}`}
            >
              News
            </A>{" "}
            <span style={{ flexGrow: 1 }} />
            { account ? (
              <AccountNavTab
                style={ page == "account" ? SelectedStyle : LinkStyle }
              />
            ) : (
              <>
                <A
                  style={ page == "sign-in" ? SelectedStyle : LinkStyle }
                  href="/auth/sign-in"
                  title={ `Sign in to ${ siteName } or create an account.` }
                >
                  Sign In
                </A>
                <A
                  style={ page == "sign-up" ? SelectedStyle : LinkStyle }
                  href="/auth/sign-up"
                  title={ `Sign up for a ${ siteName } account.` }
                >
                  Sign Up
                </A>
              </>
            ) }
            { !account && anonymousSignup && (
              <A
                style={ page == "try" ? SelectedStyle : LinkStyle }
                href={ "/auth/try" }
                title={ `Try ${ siteName } immediately without creating an account.` }
              >
                Try
              </A>
            ) }{ " " }

            { ask() }
          </Flex>
        </Flex>
      </Layout.Header>
      <SubNav page={page} subPage={subPage} softwareEnv={softwareEnv} />
      {openaiEnabled && page == "features" && (
        <div style={{ width: "700px", maxWidth: "100%", margin: "15px auto" }}>
          <ChatGPTHelp
            size="large"
            prompt={subPage ? `I am using ${subPage}.` : ""}
            tag={`features-${subPage}`}
          />
        </div>
      )}
      {jupyterApiEnabled && onCoCalcCom && runnableTag && (
        <DemoCell tag={runnableTag} />
      )}
    </>
  );
}
