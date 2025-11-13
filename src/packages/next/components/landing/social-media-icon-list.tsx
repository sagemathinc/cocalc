import React from "react";
import { Flex } from "antd";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";

enum SocialMediaType {
  FACEBOOK = "facebook",
  GITHUB = "github",
  INSTAGRAM = "instagram",
  LINKEDIN = "linkedin",
  TWITTER = "twitter",
  YOUTUBE = "youtube",
  DISCORD = "discord",
}

const ICON_MAP: Record<SocialMediaType, IconName> = {
  [SocialMediaType.FACEBOOK]: "facebook-filled",
  [SocialMediaType.GITHUB]: "github",
  [SocialMediaType.INSTAGRAM]: "instagram",
  [SocialMediaType.LINKEDIN]: "linkedin-filled",
  [SocialMediaType.TWITTER]: "twitter",
  [SocialMediaType.YOUTUBE]: "youtube-filled",
  [SocialMediaType.DISCORD]: "discord",
};

export interface SocialMediaIconListProps {
  links: Partial<Record<SocialMediaType, string>>;
  iconFontSize?: number;
  style?: React.CSSProperties;
}

export default function SocialMediaIconList(props: SocialMediaIconListProps) {
  const { links, iconFontSize = 12, style = {} } = props;

  return (
    <Flex
      align="center"
      wrap="wrap"
      style={{
        fontSize: `${iconFontSize}px`,
        ...style,
      }}
    >
      {Object.keys(links)
        .sort()
        .map((mediaType: SocialMediaType) => (
          <a
            key={mediaType}
            href={links[mediaType]}
            target="_blank"
            style={{
              color: COLORS.GRAY,
            }}
          >
            <Icon
              name={ICON_MAP[mediaType]}
              style={{ margin: `0 ${iconFontSize / 2}px` }}
            />
          </a>
        ))}
    </Flex>
  );
}
