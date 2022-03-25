/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { to_human_list } from "@cocalc/util/misc";
import { Card, Col, Layout, Row, Typography } from "antd";
import { StrategyAvatar } from "components/auth/sso";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Main from "components/landing/main";
import { ssoNav } from "components/sso";
import { Customize, CustomizeType } from "lib/customize";
import { getSSO } from "lib/sso/sso";
import { SSO } from "lib/sso/types";
import withCustomize from "lib/with-customize";
import Link from "next/link";

const { Paragraph, Text } = Typography;

interface Props {
  customize: CustomizeType;
  ssos: SSO[];
}

export const SSO_SUBTITLE = "Single Sign On";

export default function SignupIndex(props: Props) {
  const { customize, ssos } = props;

  function renderDomains(domains) {
    if (domains == null || domains.length === 0) return;
    return <Text type="secondary">{to_human_list(domains ?? [])}</Text>;
  }

  function extra(sso) {
    return <Link href={`/sso/${sso.id}`}>more</Link>;
  }

  function renderSSOs() {
    return ssos.map((sso: SSO) => {
      const strategy = {
        name: sso.id,
        size: 64,
        backgroundColor: "",
        icon: sso.icon,
        display: sso.display,
      };
      return (
        <Col xs={12} md={6} key={sso.id}>
          <Card
            size="small"
            title={<Text strong>{sso.display}</Text>}
            extra={extra(sso)}
          >
            <Paragraph style={{ textAlign: "center" }}>
              <StrategyAvatar strategy={strategy} size={64} />
            </Paragraph>
            <Paragraph style={{ textAlign: "center", marginBottom: 0 }}>
              {renderDomains(sso.domains)}
            </Paragraph>
          </Card>
        </Col>
      );
    });
  }

  function renderSSOList(): JSX.Element {
    if (ssos.length === 0) {
      return (
        <Text italic type="danger">
          There are no 3rd party SSO providers available.
        </Text>
      );
    } else {
      return (
        <Row gutter={[24, 24]} align={"top"} wrap={true}>
          {renderSSOs()}
        </Row>
      );
    }
  }

  function main() {
    return (
      <>
        <h1>{SSO_SUBTITLE}</h1>
        <Paragraph>
          Sign up at {customize.siteName} via one of these 3<sup>rd</sup> party
          single-sign-on mechanisms. You need to have an account at the
          respective organization in order to complete the sign-up process.
          Usually, this will be the only way you can sign up using your
          organization specific email address.
        </Paragraph>
        <Paragraph>{renderSSOList()}</Paragraph>
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title={SSO_SUBTITLE} />
      <Layout style={{ background: "white" }}>
        <Header />
        <Main nav={ssoNav()}>{main()}</Main>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const ssos = await getSSO();
  return await withCustomize({ context, props: { ssos } });
}
