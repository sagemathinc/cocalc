/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Space } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { CSS } from "components/misc";
import A from "components/misc/A";

interface SocialMediaShareLinksProps {
  title: string;
  url: string,
  showText?: boolean;
  standalone?: boolean; // default false
}

export function SocialMediaShareLinks(props: SocialMediaShareLinksProps) {
  const {
    title,
    url,
    standalone = false,
    showText = false,
  } = props;

  const bottomLinkStyle: CSS = {
    color: COLORS.ANTD_LINK_BLUE,
    ...(standalone ? { fontSize: "125%", fontWeight: "bold" } : {}),
  };

  const srcLink = encodeURIComponent(url);

  return (
    <Space size="middle" direction="horizontal">
      <A
        key="tweet"
        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
          title,
        )}&url=${srcLink}&via=cocalc_com`}
        style={{ color: COLORS.ANTD_LINK_BLUE, ...bottomLinkStyle }}
      >
        <Icon name="twitter" />
        {showText ? " Tweet" : ""}
      </A>
      <A
        key="facebook"
        href={`https://www.facebook.com/sharer/sharer.php?u=${srcLink}`}
        style={{ ...bottomLinkStyle }}
      >
        <Icon name="facebook-filled" />
        {showText ? " Share" : ""}
      </A>
      <A
        key="linkedin"
        href={`https://www.linkedin.com/sharing/share-offsite/?url=${srcLink}`}
        style={{ ...bottomLinkStyle }}
      >
        <Icon name="linkedin-filled" />
        {showText ? " Share" : ""}
      </A>
    </Space>
  );
}
