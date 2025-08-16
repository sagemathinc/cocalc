/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Card, Flex, Space, Tag, Tooltip } from "antd";
import { useRouter } from "next/router";
import { Fragment } from "react";
import TimeAgo from "timeago-react";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import {
  capitalize,
  getRandomColor,
  plural,
  unreachable,
} from "@cocalc/util/misc";
import { slugURL } from "@cocalc/util/news";
import { COLORS } from "@cocalc/util/theme";
import {
  CHANNELS_DESCRIPTIONS,
  CHANNELS_ICONS,
  NewsItem,
} from "@cocalc/util/types/news";
import { CSS, Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";
import { useCustomize } from "lib/customize";
import { SocialMediaShareLinks } from "../landing/social-media-share-links";
import { useDateStr } from "./useDateStr";

const STYLE: CSS = {
  borderColor: COLORS.GRAY_M,
  boxShadow: "0 0 0 1px rgba(0,0,0,.1), 0 3px 3px rgba(0,0,0,.3)",
} as const;

interface Props {
  // NewsWithStatus with optional future and expired properties
  news: NewsItem & { future?: boolean; expired?: boolean };
  dns?: string;
  showEdit?: boolean;
  small?: boolean; // limit height, essentially
  standalone?: boolean; // default false
  historyMode?: boolean; // default false
  onTagClick?: (tag: string) => void;
}

export function News(props: Props) {
  const {
    news,
    showEdit = false,
    small = false,
    standalone = false,
    historyMode = false,
    onTagClick,
  } = props;
  const {
    id,
    url,
    tags,
    title,
    date,
    channel,
    text,
    future,
    hide,
    expired,
    until,
  } = news;
  const dateStr = useDateStr(news, historyMode);
  const permalink = slugURL(news);
  const { kucalc, siteURL } = useCustomize();
  const isCoCalcCom = kucalc === KUCALC_COCALC_COM;
  const showShareLinks = typeof siteURL === "string" && isCoCalcCom;

  const bottomLinkStyle: CSS = {
    color: COLORS.ANTD_LINK_BLUE,
    ...(standalone ? { fontSize: "125%", fontWeight: "bold" } : {}),
  };

  function editLink() {
    return (
      <A
        key="edit"
        href={`/news/edit/${id}`}
        style={{
          ...bottomLinkStyle,
          color: COLORS.ANTD_RED_WARN,
        }}
      >
        <Icon name="edit" /> Edit
      </A>
    );
  }

  function readMoreLink(iconOnly = false, button = false) {
    if (button) {
      return (
        <Button
          type="primary"
          style={{ color: "white", marginBottom: "30px" }}
          href={url}
          target="_blank"
          key="url"
          size={small ? undefined : "large"}
        >
          <Icon name="external-link" />
          {iconOnly ? "" : " Read more"}
        </Button>
      );
    } else {
      return (
        <A
          key="url"
          href={url}
          style={{
            ...bottomLinkStyle,
            ...(small ? { color: COLORS.GRAY } : { fontWeight: "bold" }),
          }}
        >
          <Icon name="external-link" />
          {iconOnly ? "" : " Read more"}
        </A>
      );
    }
  }

  function renderOpenLink() {
    return (
      <A
        key="permalink"
        href={permalink}
        style={{
          ...bottomLinkStyle,
          ...(small ? { fontWeight: "bold" } : {}),
        }}
      >
        <Icon name="external-link" /> Open
      </A>
    );
  }

  function shareLinks(text = false) {
    return (
      <SocialMediaShareLinks
        title={title}
        url={encodeURIComponent(`${siteURL}${permalink}`)}
        showText={text}
        standalone={standalone}
      />
    );
  }

  function actions() {
    const actions = [renderOpenLink()];
    if (url) actions.push(readMoreLink());
    if (showEdit) actions.push(editLink());
    if (showShareLinks) actions.push(shareLinks());
    return actions;
  }

  const style = small ? { height: "200px", overflow: "auto" } : undefined;

  function renderFuture() {
    if (future) {
      return (
        <Alert
          banner
          message={
            <>
              Future event, not shown to users.
              {typeof date === "number" && (
                <>
                  {" "}
                  Will be live in <TimeAgo datetime={new Date(1000 * date)} />.
                </>
              )}
            </>
          }
        />
      );
    }
  }

  function renderHidden() {
    if (hide) {
      return (
        <Alert
          banner
          type="error"
          message="Hidden, will not be shown to users."
        />
      );
    }
  }

  function renderExpired() {
    if (expired) {
      return (
        <Alert
          banner
          type="warning"
          message={
            <>
              Expired news item, not shown to users.
              {typeof until === "number" && (
                <>
                  {" "}
                  Expired <TimeAgo datetime={new Date(1000 * until)} />.
                </>
              )}
            </>
          }
        />
      );
    }
  }

  function renderTags() {
    return <TagList mode="news" tags={tags} onTagClick={onTagClick} />;
  }

  function extra() {
    return (
      <>
        {renderTags()}
        <Text type="secondary" style={{ float: "right" }}>
          {dateStr}
        </Text>
      </>
    );
  }

  function renderTitle() {
    return (
      <>
        <Tooltip
          title={
            <>
              {capitalize(channel)}: {CHANNELS_DESCRIPTIONS[channel]}
            </>
          }
        >
          <Icon name={CHANNELS_ICONS[channel] as IconName} />
        </Tooltip>{" "}
        <A href={permalink}>{title}</A>
      </>
    );
  }

  function renderHistory() {
    const { history } = news;
    if (!history) return;
    // Object.keys always returns strings, so we need to parse them
    const timestamps = Object.keys(history)
      .map(Number)
      .filter((ts) => !Number.isNaN(ts))
      .sort()
      .reverse();
    if (timestamps.length > 0) {
      return (
        <Paragraph style={{ textAlign: "center" }}>
          {historyMode && (
            <>
              <A href={permalink}>Current version</A> &middot;{" "}
            </>
          )}
          Previous {plural(timestamps.length, "version")}:{" "}
          {timestamps
            .map((ts) => [
              <A key={ts} href={`/news/${id}/${ts}`}>
                <TimeAgo datetime={new Date(1000 * ts)} />
              </A>,
              <Fragment key={`m-${ts}`}> &middot; </Fragment>,
            ])
            .flat()
            .slice(0, -1)}
        </Paragraph>
      );
    }
  }

  if (standalone) {
    const renderedTags = renderTags();
    return (
      <>
        {historyMode && (
          <Paragraph>
            <Text type="danger" strong>
              Archived version
            </Text>
            <Text type="secondary" style={{ float: "right" }}>
              Published: {dateStr}
            </Text>
          </Paragraph>
        )}
        <Title level={2}>
          <Icon name={CHANNELS_ICONS[channel] as IconName} /> {title}
          {renderedTags && (
            <span style={{ float: "right" }}>{renderedTags}</span>
          )}
        </Title>
        {renderFuture()}
        {renderHidden()}
        {renderExpired()}
        <Markdown value={text} style={{ ...style, minHeight: "20vh" }} />

        <Flex align="baseline" justify="space-between" wrap="wrap">
          {url && (
            <Paragraph style={{ textAlign: "center" }}>
              {readMoreLink(false, true)}
            </Paragraph>
          )}
          <Paragraph
            style={{
              fontWeight: "bold",
              textAlign: "center",
            }}
          >
            <Space size="middle" direction="horizontal">
              {showEdit ? editLink() : undefined}
              {showShareLinks ? shareLinks(true) : undefined}
            </Space>
          </Paragraph>
          {renderHistory()}
        </Flex>
      </>
    );
  } else {
    return (
      <>
        <Card
          title={renderTitle()}
          style={STYLE}
          extra={extra()}
          actions={actions()}
        >
          {renderFuture()}
          {renderHidden()}
          {renderExpired()}
          <Markdown value={text} style={style} />
        </Card>
      </>
    );
  }
}

interface TagListProps {
  tags?: string[];
  onTagClick?: (tag: string) => void;
  style?: CSS;
  styleTag?: CSS;
  mode: "news" | "event";
}

export function TagList({
  tags,
  onTagClick,
  style,
  styleTag,
  mode,
}: TagListProps) {
  if (tags == null || !Array.isArray(tags) || tags.length === 0) return null;

  const router = useRouter();

  function onTagClickStandalone(tag: string) {
    router.push(`/news?tag=${tag}`);
  }

  function onClick(tag) {
    switch (mode) {
      case "news":
        (onTagClick ?? onTagClickStandalone)(tag);
      case "event":
        return;
      default:
        unreachable(mode);
    }
  }

  function getStyle(): CSS {
    return {
      ...(mode === "news" ? { cursor: "pointer" } : {}),
      ...styleTag,
    };
  }

  return (
    <Space size={[0, 4]} wrap={false} style={style}>
      {tags.sort().map((tag) => (
        <Tag
          color={getRandomColor(tag)}
          key={tag}
          style={getStyle()}
          onClick={() => onClick(tag)}
        >
          {tag}
        </Tag>
      ))}
    </Space>
  );
}
