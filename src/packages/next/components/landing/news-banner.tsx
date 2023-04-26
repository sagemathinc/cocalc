/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { slugURL } from "@cocalc/util/news";
import { COLORS } from "@cocalc/util/theme";
import { CHANNELS_ICONS, RecentHeadline } from "@cocalc/util/types/news";
import { Paragraph, Text } from "components/misc";
import A from "components/misc/A";
import { NewsTags } from "components/news/news";
import { useDateStr } from "components/news/useDateStr";
import { MAX_WIDTH } from "lib/config";

const PADDING = "15px";
const FONT_SIZE = "16px";

// This is similar to the "BannerWithLinks" component, but showing recent news
export function NewsBanner({
  recentHeadline,
}: {
  recentHeadline: RecentHeadline | null;
}) {
  if (recentHeadline == null) return null;

  const { channel, title, tags } = recentHeadline;
  const permalink = slugURL(recentHeadline);
  const dateStr = useDateStr(recentHeadline);

  function renderHeadline() {
    return (
      <span style={{ paddingLeft: PADDING }}>
        <Icon name={CHANNELS_ICONS[channel] as IconName} /> {dateStr}{" "}
        <A
          href={permalink}
          style={{ paddingLeft: PADDING, fontWeight: "bold" }}
        >
          {title}
        </A>{" "}
        <NewsTags
          tags={tags}
          style={{ paddingLeft: PADDING }}
          styleTag={{ fontSize: FONT_SIZE }}
        />
      </span>
    );
  }

  return (
    <div style={{ backgroundColor: COLORS.YELL_LL }}>
      <Paragraph
        style={{
          margin: "0 auto",
          padding: "10px",
          textAlign: "center",
          maxWidth: MAX_WIDTH,
        }}
      >
        <Text
          style={{
            fontSize: FONT_SIZE,
          }}
        >
          {renderHeadline()}
          <span style={{ paddingLeft: PADDING }}>
            <A href={"/news"}>All news...</A>
          </span>
        </Text>
      </Paragraph>
    </div>
  );
}
