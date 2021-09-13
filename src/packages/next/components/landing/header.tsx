import Link from "next/link";
import SquareLogo from "components/logo-square";
import A from "components/misc/A";
import { join } from "path";
import { Layout } from "antd";
import { useCustomize } from "lib/customize";
import basePath from "lib/base-path";
import SubNav, { Page, SubPage } from "./sub-nav";

const GAP = "32px";

const LinkStyle = {
  color: "white",
  marginRight: GAP,
  display: "inline-block",
};

const SelectedStyle = {
  ...LinkStyle,
  color: "#c7d9f5",
  fontWeight: "bold",
  borderBottom: "1px solid white",
};

interface Props {
  page?: Page;
  subPage?: SubPage;
}

export default function Header({ page, subPage }: Props) {
  const {
    anonymousSignup,
    helpEmail,
    siteName,
    termsOfServiceURL,
    shareServer,
    landingPages,
  } = useCustomize();
  if (basePath == null) return null;

  return (
    <>
      <Layout.Header
        style={{
          minHeight: "64px",
          height: "auto",
          lineHeight: "32px",
          padding: "16px",
          textAlign: "center",
        }}
      >
        <A href="/">
          <SquareLogo style={{ height: "40px", marginRight: GAP }} />
        </A>
        {landingPages && (
          <>
            <A
              href="/features/"
              style={page == "features" ? SelectedStyle : LinkStyle}
            >
              Features
            </A>
            <A
              href="/software"
              style={page == "software" ? SelectedStyle : LinkStyle}
            >
              Software
            </A>
            <A
              href="/billing"
              style={page == "billing" ? SelectedStyle : LinkStyle}
            >
              Pricing
            </A>
            <A
              href="/policies"
              style={page == "policies" ? SelectedStyle : LinkStyle}
            >
              Policies
            </A>
          </>
        )}
        {anonymousSignup && (
          <a
            style={LinkStyle}
            href={join(basePath, "static/app.html?anonymous=jupyter")}
            title={`Try ${siteName} immediately without creating an account.`}
          >
            Try {siteName}
          </a>
        )}
        {shareServer && (
          <Link href={"/share/public_paths/page/1"}>
            <a style={LinkStyle} title="View files that people have published.">
              Published Files
            </a>
          </Link>
        )}
        {termsOfServiceURL && (
          <A
            style={LinkStyle}
            href={termsOfServiceURL}
            title="View the terms of service and other legal documents."
          >
            Legal
          </A>
        )}
        {helpEmail && (
          <A
            style={LinkStyle}
            href={`mailto:${helpEmail}`}
            title={`Ask us a question via email to ${helpEmail}.`}
          >
            Help
          </A>
        )}
        <A
          style={LinkStyle}
          href="https://doc.cocalc.com"
          title="View the CoCalc documenation."
        >
          Docs
        </A>
        <a
          style={LinkStyle}
          href={join(basePath, "static/app.html")}
          title={`Sign in to ${siteName} or create an account.`}
        >
          Sign In
        </a>
      </Layout.Header>
      {landingPages && page && <SubNav page={page} subPage={subPage} />}
    </>
  );
}
