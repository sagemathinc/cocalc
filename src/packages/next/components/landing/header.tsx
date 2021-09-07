import Link from "next/link";
import SquareLogo from "components/logo-square";
import A from "components/misc/A";
import { join } from "path";
import { Layout } from "antd";
import { useCustomize } from "lib/customize";
import basePath from "lib/base-path";
import LandingNav, { LandingPageName } from "./landing-nav";

const GAP = "32px";

const LinkStyle = {
  color: "white",
  marginRight: GAP,
  display: "inline-block",
};

interface Props {
  landing?: LandingPageName;
}

export default function Header({ landing }: Props) {
  const {
    anonymousSignup,
    helpEmail,
    siteName,
    termsOfServiceURL,
    shareServer,
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
        <SquareLogo style={{ height: "40px", marginRight: GAP }} />
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
            Email Help
          </A>
        )}
        <A
          style={LinkStyle}
          href="https://doc.cocalc.com"
          title="View the CoCalc documenation."
        >
          Documentation
        </A>
        <a
          style={LinkStyle}
          href={join(basePath, "static/app.html")}
          title={`Sign in to ${siteName} or create an account.`}
        >
          Sign In
        </a>
      </Layout.Header>
      {landing && <LandingNav landing={landing} />}
    </>
  );
}
