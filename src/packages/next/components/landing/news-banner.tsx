/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useEffect, useRef, useState } from "react";
import { useAsyncEffect } from "use-async-effect";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { slugURL } from "@cocalc/util/news";
import { COLORS } from "@cocalc/util/theme";
import { CHANNELS_ICONS, RecentHeadline } from "@cocalc/util/types/news";
import { Paragraph } from "components/misc";
import A from "components/misc/A";
import { TagList } from "components/news/news";
import { useDateStr } from "components/news/useDateStr";
import { MAX_WIDTH } from "lib/config";

const PADDING = "15px";
const FONT_SIZE = "16px";
const ROTATE_DELAY_S = 15; // every that number of second a new news item is shown
const ANIMATE_DELAY_MS = 10; // less means faster

// This is similar to the "BannerWithLinks" component, but showing recent news
export function NewsBanner({
  recentHeadlines,
  headlineIndex,
}: {
  recentHeadlines: RecentHeadline[] | null;
  headlineIndex: number;
}) {
  // we have to initialize it with a value from the server to avoid these hydration errors
  const [index, setIndex] = useState<number>(headlineIndex);

  useEffect(() => {
    // every $ROTATE_DELAY_S, rotate to the next headline
    const interval = setInterval(() => {
      setIndex((i) => ((i ?? 0) + 1) % (recentHeadlines?.length ?? 0));
    }, ROTATE_DELAY_S * 1000);

    return () => clearInterval(interval);
  }, []);

  if (recentHeadlines == null || recentHeadlines.length === 0) return null;

  return (
    <div style={{ backgroundColor: COLORS.YELL_LL, overflow: "hidden" }}>
      <NewsHeader item={recentHeadlines[index]} />
    </div>
  );
}

function NewsHeader({ item }: { item: RecentHeadline }) {
  const [first, setFirst] = useState(true);
  const textRef = useRef<HTMLDivElement>(null);
  const [cur, setCur] = useState<RecentHeadline>(item);
  const [top, setTop] = useState(0);
  const [opacity, setOpacity] = useState(1);

  useAsyncEffect(
    async (isMounted) => {
      if (first) {
        setFirst(false);
        return;
      }

      // height of the textRef element
      const offset = textRef.current?.offsetHeight ?? 0;
      for (let i = 0; i < offset; i++) {
        await new Promise((resolve) => setTimeout(resolve, ANIMATE_DELAY_MS));
        if (!isMounted()) return;
        setTop(i);
        setOpacity(Math.max(0, 1 - (2 * i) / offset));
      }
      setTop(-offset);
      setCur(item);
      for (let i = 0; i < offset; i++) {
        await new Promise((resolve) => setTimeout(resolve, ANIMATE_DELAY_MS));
        if (!isMounted()) return;
        setTop(-offset + i);
        setOpacity(Math.min(1, (2 * i) / offset));
      }
    },
    [item],
  );

  const permalink = slugURL(cur);
  const dateStr = useDateStr(cur);

  function renderHeadline() {
    if (cur == null) return null;
    const { channel, title, tags } = cur;
    return (
      <>
        <div style={{ paddingRight: ".5em" }}>
          <Icon name={CHANNELS_ICONS[channel] as IconName} />
        </div>
        {dateStr}{" "}
        <A
          href={permalink}
          style={{
            paddingLeft: PADDING,
            fontWeight: "bold",
            // https://github.com/sagemathinc/cocalc/issues/6684
            maxWidth: "800px",
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </A>{" "}
        <TagList
          tags={tags}
          mode="news"
          style={{ paddingLeft: PADDING }}
          styleTag={{ fontSize: FONT_SIZE }}
        />
      </>
    );
  }

  return (
    <div
      ref={textRef}
      style={{
        padding: "10px",
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      <Paragraph
        style={{
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          margin: "0 auto",
          position: "relative",
          top,
          opacity,
          fontSize: FONT_SIZE,
          maxWidth: MAX_WIDTH,
        }}
      >
        {renderHeadline()}
        <span style={{ paddingLeft: PADDING }}>
          <A href={"/news"}>All news...</A>
        </span>
      </Paragraph>
    </div>
  );
}
