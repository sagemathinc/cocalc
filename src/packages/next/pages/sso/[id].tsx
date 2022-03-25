/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { r_human_list } from "@cocalc/frontend/components/r_human_list";
import { Button, Layout, Typography } from "antd";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Main from "components/landing/main";
import SanitizedMarkdown from "components/misc/sanitized-markdown";
import { ssoNav } from "components/sso";
import basePath from "lib/base-path";
import { Customize, CustomizeType } from "lib/customize";
import { getOneSSO } from "lib/sso/sso";
import withCustomize from "lib/with-customize";
import Link from "next/link";
import { join } from "path";
import { SSO_SUBTITLE } from ".";

const { Paragraph, Text } = Typography;

interface Props {
  customize: CustomizeType;
  id: string;
  descr?: string;
  display: string;
  icon?: string;
  domains: string[];
}

export default function Signup(props: Props) {
  const { id, descr, display, icon, domains, customize } = props;

  function renderDescr() {
    const fallback = `If you have an account at this provider,
    you can signup here to get access to ${customize.siteName}.`;
    const md = `## ${display}\n\n${descr ?? fallback}`;
    return <SanitizedMarkdown value={md} />;
  }

  function renderIcon() {
    if (icon == null) return null;
    return (
      <div style={{ float: "right" }}>
        <img src={icon} width={100} height={100} />
      </div>
    );
  }

  function renderExclusiveDomains() {
    if (domains.length === 0) return null;
    return (
      <Paragraph>
        This is required for email addresses at{" "}
        {r_human_list((domains ?? []).map((d) => <Text code>{d}</Text>))}
      </Paragraph>
    );
  }

  function renderButton() {
    const href = join(basePath, "auth", id);
    return (
      <Button
        href={href}
        type="primary"
        size="large"
        style={{ marginTop: "50px" }}
      >
        Signup via {display}
      </Button>
    );
  }

  function main() {
    return (
      <>
        {renderIcon()}
        {renderDescr()}
        {renderExclusiveDomains()}
        {renderButton()}
      </>
    );
  }

  function nav(): JSX.Element[] {
    return [...ssoNav(), <Link href={`/sso/{id}`}>{display}</Link>];
  }

  return (
    <Customize value={customize}>
      <Head title={`${SSO_SUBTITLE} – ${display}`} />
      <Layout style={{ background: "white" }}>
        <Header />
        <Main nav={nav()}>{main()}</Main>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const { id } = context.params;
  const info = await getOneSSO(id);
  return await withCustomize({ context, props: { ...info } });
}
