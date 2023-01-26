/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout, Space } from "antd";

import A from "components/misc/A";
import Logo from "components/logo";
import { useCustomize } from "lib/customize";
import Contact from "./contact";
import { CSS, Paragraph } from "components/misc";

const STYLE: CSS = {
  textAlign: "center",
  borderTop: "1px solid lightgrey",
  backgroundColor: "white",
};

interface Props {
  first?: boolean;
  children: string | JSX.Element;
}

function Item(props: Props): JSX.Element {
  const { first, children } = props;

  if (first) {
    return <>{children}</>;
  } else {
    return (
      <>
        &nbsp;{" – "}&nbsp;{children}
      </>
    );
  }
}

export default function Footer() {
  const {
    siteName,
    organizationName,
    organizationURL,
    termsOfServiceURL,
    contactEmail,
    landingPages,
    imprint,
    onCoCalcCom,
    isCommercial,
    imprintOrPolicies,
  } = useCustomize();

  function organization(): JSX.Element {
    if (organizationURL) {
      return <A href={organizationURL}>{organizationName}</A>;
    } else {
      return <>{organizationName}</>;
    }
  }

  function renderOrganization() {
    if (!organizationName) return null;
    return <Item>{organization()}</Item>;
  }

  return (
    <Layout.Footer style={STYLE}>
      <Space size="middle" direction="vertical">
        <Paragraph>
          <Item first>{siteName ?? "CoCalc"}</Item>
          {onCoCalcCom && (
            <Item>
              <A href="https://about.cocalc.com/">About</A>
            </Item>
          )}
          {renderOrganization()}
          {!landingPages && termsOfServiceURL && (
            <Item>
              <A href={termsOfServiceURL}>Terms of Service</A>
            </Item>
          )}
          {contactEmail && (
            <Item>
              <Contact showEmail={false} />
            </Item>
          )}
          {imprint && (
            <Item>
              <A href="/policies/imprint">Imprint</A>
            </Item>
          )}
          {(landingPages || imprintOrPolicies) && (
            <Item>
              <A href="/policies">Policies</A>
            </Item>
          )}
          {isCommercial && (
            <Item>
              <A href="/pricing">Products and Pricing</A>
            </Item>
          )}
          {landingPages && (
            <Item>
              <A href="/software">Software</A>
            </Item>
          )}
          <Item>
            <A href="/info/status">Status</A>
          </Item>
        </Paragraph>
        <Paragraph>
          <Logo type="rectangular" width={200} />
        </Paragraph>
      </Space>
    </Layout.Footer>
  );
}
