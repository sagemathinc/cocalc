/*
 *  This file is part of CoCalc: Copyright © 2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Flex, Layout, Row, Space, Typography } from "antd";

import { COLORS } from "@cocalc/util/theme";

import { is_valid_email_address as isValidEmailAddress } from "@cocalc/util/misc";
import Logo from "components/logo";
import { CSS } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { useCustomize } from "lib/customize";

import { liveDemoUrl } from "components/landing/live-demo";
import SocialMediaIconList from "./social-media-icon-list";

const FOOTER_STYLE: CSS = {
  borderTop: `1px solid ${COLORS.GRAY_L}`,
  backgroundColor: COLORS.WHITE,
};

const FOOTER_COLUMNS_STYLE: CSS = {
  minWidth: "200px",
  flexGrow: 1,
} as const;

const FOOTER_COLUMN_STYLE = {
  marginTop: "32px",
  minWidth: "128px",
} as const;

const FOOTER_TABLE_STYLE: CSS = {
  maxWidth: MAX_WIDTH,
  marginBottom: "36px",
  width: "100%",
} as const;

const FOOTER_LINK_STYLE: CSS = {
  color: COLORS.GRAY_D,
} as const;

const LOGO_COLUMN_STYLE = {
  paddingBottom: "24px",
  marginTop: "32px",
} as const;

interface FooterLink {
  text: string;
  url?: string;
  hide?: boolean;
  onClick?: () => void;
}

interface FooterColumn {
  header: string;
  links: Array<FooterLink>;
}

export default function Footer() {
  const {
    contactEmail,
    onCoCalcCom,
    organizationName,
    organizationURL,
    enabledPages,
    cookieBannerEnabled,
    isAuthenticated,
    termsOfServiceURL,
    supportVideoCall,
  } = useCustomize();

  const footerColumns: Array<FooterColumn> = [
    {
      header: "Product",
      links: [
        {
          text: "Store",
          url: "/store",
          hide: !enabledPages?.store,
        },
        {
          text: "Features",
          url: "/features",
          hide: !enabledPages?.features,
        },
        {
          text: "Licenses",
          url: "/licenses",
          hide: !enabledPages?.licenses,
        },
        {
          text: "Pricing",
          url: "/pricing",
          hide: !enabledPages?.pricing,
        },
        {
          text: "On-Premises",
          url: "/pricing/onprem",
          hide: !enabledPages?.onPrem,
        },
        {
          text: "Translations",
          url: "/lang",
        },
        {
          text: "System Activity",
          url: "/info/status",
          hide: !enabledPages?.systemActivity,
        },
        {
          text: "Status",
          url: "https://status.cocalc.com/",
          hide: !enabledPages?.status,
        },
      ],
    },
    {
      header: "Resources",
      links: [
        {
          text: "Documentation",
          url: "/info/doc",
          hide: !enabledPages?.info,
        },
        {
          text: "Compute Servers",
          url: "https://doc.cocalc.com/compute_server.html",
          hide: !enabledPages?.compute,
        },
        {
          text: "Public Share",
          url: "/share/public_paths/page/1",
          hide: !enabledPages?.share,
        },
        {
          text: "Software",
          url: "/software",
          hide: !enabledPages?.software,
        },
        {
          text: "Support",
          url: "/support",
          hide: !enabledPages?.support,
        },
        {
          text: "Get a Live Demo",
          url: supportVideoCall ?? "",
          hide: !enabledPages?.liveDemo || !supportVideoCall,
        },
        {
          text: "Contact Us",
          url: liveDemoUrl("footer"),
          hide: !enabledPages?.support,
        },
      ],
    },
    {
      header: "Company",
      links: [
        {
          text: "About",
          url: "/about",
          hide: !enabledPages?.about.index,
        },
        {
          text: "Contact",
          url: contactEmail || "",
          hide: !enabledPages?.contact,
        },
        {
          text: "Events",
          url: "/about/events",
          hide: !enabledPages?.about.events,
        },
        {
          text: "Team",
          url: "/about/team",
          hide: !enabledPages?.about.team,
        },
        {
          text: "Imprint",
          url: "/policies/imprint",
          hide: !enabledPages?.policies.imprint,
        },
        {
          text: "News",
          url: "/news",
          hide: !enabledPages?.news,
        },
        {
          text: "Policies",
          url: "/policies",
          hide: !enabledPages?.policies.index,
        },
        {
          text: "Clear cookies",
          hide: !cookieBannerEnabled || !!isAuthenticated,
          onClick: clearCookieChoices,
        },
        {
          text: "Terms of Service",
          url: termsOfServiceURL || "",
          hide: !enabledPages?.termsOfService,
        },
        {
          text: organizationName || "Company",
          url: organizationURL || "",
          hide: !enabledPages?.organization,
        },
      ],
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
        {column.links
          .filter((footerLink) => !footerLink.hide)
          .map((footerLink) => (
            <FooterColumnLink
              footerLink={footerLink}
              key={footerLink.url ?? footerLink.text}
            />
          ))}
      </Space>
    ));
  }

  return (
    <Layout.Footer style={FOOTER_STYLE}>
      <Flex justify="center">
        <Row justify="space-between" style={FOOTER_TABLE_STYLE}>
          <Col xs={24} md={8}>
            <Flex
              justify="space-between"
              align="center"
              wrap="wrap"
              style={LOGO_COLUMN_STYLE}
            >
              <Logo type="rectangular" width={150} />
              {onCoCalcCom && (
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
              )}
            </Flex>
          </Col>
          <Col xs={24} md={16}>
            <Flex
              justify="space-between"
              style={FOOTER_COLUMNS_STYLE}
              wrap="wrap"
            >
              {renderFooterColumns()}
            </Flex>
          </Col>
        </Row>
      </Flex>
    </Layout.Footer>
  );
}

function FooterColumnLink({ footerLink }: { footerLink: FooterLink }) {
  if (footerLink.onClick != null) {
    return (
      <Typography.Link onClick={footerLink.onClick} style={FOOTER_LINK_STYLE}>
        {footerLink.text}
      </Typography.Link>
    );
  }
  const url = footerLink.url ?? "";
  return (
    <A
      href={isValidEmailAddress(url) ? `mailto:${url}` : url}
      style={FOOTER_LINK_STYLE}
    >
      {footerLink.text}
    </A>
  );
}

function clearCookieChoices(): void {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return;
  }

  const names = new Set(["cc_cookie", "cocalc_youtube_consent", "CC_ANA"]);
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.trim().split("=")[0];
    if (/^_ga/.test(name) || /^_gid/.test(name)) {
      names.add(name);
    }
  }

  const domains = getCookieClearDomains(window.location.hostname);
  for (const name of names) {
    for (const domain of domains) {
      clearCookie(name, domain);
    }
  }
  window.location.reload();
}

function getCookieClearDomains(hostname: string): Array<string | undefined> {
  const domains: Array<string | undefined> = [
    undefined,
    hostname,
    `.${hostname}`,
  ];
  const parts = hostname.split(".");
  if (parts.length > 2) {
    domains.push(`.${parts.slice(-2).join(".")}`);
  }
  return domains;
}

function clearCookie(name: string, domain?: string): void {
  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax${
    domain == null ? "" : `; domain=${domain}`
  }`;
}
