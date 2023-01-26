/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";
import Link from "next/link";
import { join } from "path";

import { Icon } from "@cocalc/frontend/components/icon";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { COLORS } from "@cocalc/util/theme";
import AccountNavTab from "components/account/navtab";
import Analytics from "components/analytics";
import Logo from "components/logo";
import A from "components/misc/A";
import basePath from "lib/base-path";
import { useCustomize } from "lib/customize";
import { SoftwareEnvNames } from "lib/landing/consts";
import SubNav, { Page, SubPage } from "./sub-nav";

const GAP = "4%";

export const LinkStyle: React.CSSProperties = {
  color: "white",
  marginRight: GAP,
  display: "inline-block",
} as const;

const SelectedStyle: React.CSSProperties = {
  ...LinkStyle,
  color: COLORS.LANDING.TOP_BG,
  fontWeight: "bold",
  borderBottom: "5px solid #c7d9f5",
} as const;

interface Props {
  page?: Page;
  subPage?: SubPage;
  softwareEnv?: SoftwareEnvNames;
}

export default function Header(props: Props) {
  const { page, subPage, softwareEnv } = props;
  const {
    isCommercial,
    anonymousSignup,
    siteName,
    termsOfServiceURL,
    shareServer,
    landingPages,
    account,
    imprintOrPolicies,
  } = useCustomize();

  if (basePath == null) return null;

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
        {isCommercial && !IS_MOBILE && (
          <A
            type="primary"
            size="large"
            href="/support/new?hideExtra=true&type=question&subject=&body=&title=Ask%20Us%20Anything!"
            title="Ask a question"
            style={{
              position: "absolute",
              right: 15,
              top: 25,
              color: "white",
            }}
          >
            <Icon style={{ fontSize: "24px" }} name="question-circle" />
          </A>
        )}
        <A href="/">
          {/* WARNING: This mess is all to support using the next/image component for the image via our Image component.  It's ugly. */}
          <div
            style={{
              position: "relative",
              display: "inline-block",
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
                top: "15px",
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
              <A
                href="/store"
                style={page == "store" ? SelectedStyle : LinkStyle}
              >
                Store
              </A>
            )}
            <A
              href="/features/"
              style={page == "features" ? SelectedStyle : LinkStyle}
            >
              Features
            </A>
            {/* <A
              href="/software"
              style={page == "software" ? SelectedStyle : LinkStyle}
            >
              Software
            </A>
            */}
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
        {!account && anonymousSignup && (
          <A
            style={page == "try" ? SelectedStyle : LinkStyle}
            href={"/auth/try"}
            title={`Try ${siteName} immediately without creating an account.`}
          >
            Try
          </A>
        )}{" "}
        {account ? (
          <AccountNavTab
            style={page == "account" ? SelectedStyle : LinkStyle}
          />
        ) : (
          <>
            <A
              style={page == "sign-in" ? SelectedStyle : LinkStyle}
              href="/auth/sign-in"
              title={`Sign in to ${siteName} or create an account.`}
            >
              Sign In
            </A>
            <A
              style={page == "sign-up" ? SelectedStyle : LinkStyle}
              href="/auth/sign-up"
              title={`Sign up for a ${siteName} account.`}
            >
              Sign Up
            </A>
          </>
        )}
      </Layout.Header>
      {page &&
        (page === "software" ||
          page === "features" ||
          landingPages ||
          imprintOrPolicies) && (
          <SubNav page={page} subPage={subPage} softwareEnv={softwareEnv} />
        )}
    </>
  );
}
