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
}

const ICON_MAP: Record<SocialMediaType, IconName> = {
  [SocialMediaType.FACEBOOK]: "facebook-filled",
  [SocialMediaType.GITHUB]: "github",
  [SocialMediaType.INSTAGRAM]: "instagram",
  [SocialMediaType.LINKEDIN]: "linkedin-filled",
  [SocialMediaType.TWITTER]: "twitter",
  [SocialMediaType.YOUTUBE]: "youtube-filled",
}

export interface SocialMediaIconListProps {
  links: Partial<Record<SocialMediaType, string>>;
  iconFontSize?: number;
  style?: React.CSSProperties;
}

const SocialMediaIconList = (props: SocialMediaIconListProps) => {
  const {
    links,
    iconFontSize = 12,
    style = {}
  } = props;

  return (
    <Flex
      align="center"
      wrap="wrap"
      style={{
        width: "100%",
        fontSize: `${iconFontSize}px`,
        ...style,
      }}>
      {
        Object.keys(links).sort().map((mediaType: SocialMediaType) => (
          <a
            key={mediaType}
            href={links[mediaType]}
            target="_blank"
            style={{
              width: `${iconFontSize + 12}px`,
              color: COLORS.GRAY,
            }}
          >
            <Icon name={ICON_MAP[mediaType]}/>
          </a>
        ))
      }
    </Flex>
  );
}

export default SocialMediaIconList;
