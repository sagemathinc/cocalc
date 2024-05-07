/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Flex, Layout, Row, Space, Typography } from "antd";

import { COLORS } from "@cocalc/util/theme";

import A from "components/misc/A";
import Logo from "components/logo";
import { CSS } from "components/misc";

import { MAX_WIDTH } from "lib/config";
import { useCustomize } from "lib/customize";

import SocialMediaIconList from "./social-media-icon-list";

const FOOTER_STYLE: CSS = {
  borderTop: "1px solid lightgrey",
  backgroundColor: "white",
};

const FOOTER_COLUMNS_STYLE: CSS = {
  minWidth: "200px",
  flexGrow: 1,
};

const FOOTER_COLUMN_STYLE = {
  marginTop: "32px",
  minWidth: "128px",
};

const FOOTER_TABLE_STYLE: CSS = {
  maxWidth: MAX_WIDTH,
  marginBottom: "36px",
  width: "100%",
};

const LOGO_COLUMN_STYLE = {
  paddingBottom: "24px",
  marginTop: "32px",
};

interface FooterLink {
  text: string;
  url: string;
  hide?: boolean;
}

interface FooterColumn {
  header: string;
  links: Array<FooterLink>;
}

export default function Footer() {
  const {
    organizationName,
    organizationURL,
    termsOfServiceURL,
    contactEmail,
    landingPages,
    imprint,
    onCoCalcCom,
    isCommercial,
    imprintOrPolicies,
    shareServer,
  } = useCustomize();

  const footerColumns: Array<FooterColumn> = [
    {
      header: "Product",
      links: [
        { text: "Store", url: "/store", hide: !isCommercial },
        { text: "Features", url: "/features" },
        { text: "Licenses", url: "/licenses" },
        { text: "Pricing", url: "/pricing", hide: !isCommercial },
        { text: "On Premises", url: "/pricing/onprem", hide: !onCoCalcCom },
        { text: "System Status", url: "https://status.cocalc.com/", hide: !onCoCalcCom },
      ]
    },
    {
      header: "Resources",
      links: [
        { text: "Documentation", url: "/info/doc" },
        { text: "Compute Servers", url: "https://doc.cocalc.com/compute_server.html", hide: !isCommercial },
        { text: "Public Share", url: "/share/public_paths/page/1", hide: !shareServer },
        { text: "Software", url: "/software", hide: !landingPages },
        { text: "System Monitor", url: "/info/status" },
        { text: "Support", url: "/support" },
      ]
    },
    {
      header: "Company",
      links: [
        { text: "About", url: "/about", hide: !landingPages },
        { text: "Contact", url: contactEmail || "", hide: !contactEmail },
        { text: "Events", url: "/about/events" },
        { text: "Team", url: "/about/team", hide: !landingPages },
        { text: "Imprint", url: "/policies/imprint", hide: !imprint },
        { text: "News", url: "/news" },
        { text: "Policies", url: "/policies", hide: !(landingPages || imprintOrPolicies) },
        { text: "Terms of Service", url: termsOfServiceURL || "", hide: landingPages || !termsOfServiceURL},
        { text: organizationName || "Company", url: organizationURL || "", hide: !organizationURL}
      ]
    },
  ];

  function renderFooterColumns() {
    return footerColumns.map((column) => (
      <Space
        key={`footer-column-${column.header}`}
        direction="vertical"
        size="small"
        style={FOOTER_COLUMN_STYLE}
      >
        <Typography.Title level={5}>{column.header}</Typography.Title>
        {
          column.links
            .filter(footerLink => !footerLink.hide)
            .map((footerLink) => (
              <A external
                 href={footerLink.url}
                 style={{ color: COLORS.GRAY_D }}
              >
                {footerLink.text}
              </A>
            ))
        }
      </Space>
    ))
  }

  return (
    <Layout.Footer style={FOOTER_STYLE}>
      <Flex justify="center">
        <Row
          justify="space-between"
          style={FOOTER_TABLE_STYLE}
        >
          <Col xs={24} md={8}>
            <Flex
              justify="space-between"
              align="center"
              wrap="wrap"
              style={LOGO_COLUMN_STYLE}
            >
              <Logo type="rectangular" width={150}/>
              {
                isCommercial && (
                  <SocialMediaIconList
                    links={{
                      facebook: "https://www.facebook.com/CoCalcOnline",
                      github: "https://github.com/sagemathinc/cocalc",
                      linkedin: "https://www.linkedin.com/company/sagemath-inc./",
                      twitter: "https://twitter.com/cocalc_com",
                      youtube: "https://www.youtube.com/c/SagemathCloud",
                    }}
                    iconFontSize={20}
                  />
                )
              }
            </Flex>
          </Col>
          <Col xs={24} md={16}>
            <Flex justify="space-between" style={FOOTER_COLUMNS_STYLE} wrap="wrap">
              {renderFooterColumns()}
            </Flex>
          </Col>
        </Row>
      </Flex>
    </Layout.Footer>
  );
}
