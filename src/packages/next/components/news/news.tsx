/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Button, Card, Space, Tag, Tooltip } from "antd";
import { useRouter } from "next/router";
import { Fragment } from "react";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { capitalize, getRandomColor, plural } from "@cocalc/util/misc";
import { slugURL } from "@cocalc/util/news";
import { COLORS } from "@cocalc/util/theme";
import {
  CHANNELS_DESCRIPTIONS,
  CHANNELS_ICONS,
  NewsItem,
} from "@cocalc/util/types/news";
import { CSS, Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";
import TimeAgo from "timeago-react";
import { useDateStr } from "./useDateStr";
import { useCustomize } from "lib/customize";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";

const STYLE: CSS = {
  borderColor: COLORS.GRAY_M,
  boxShadow: "0 0 0 1px rgba(0,0,0,.1), 0 3px 3px rgba(0,0,0,.3)",
} as const;

interface Props {
  // NewsWithFuture with optional future property
  news: NewsItem & { future?: boolean };
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
  const { id, url, tags, title, date, channel, text, future, hide } = news;
  const dateStr = useDateStr(news, historyMode);
  const permalink = slugURL(news);
  const { kucalc, dns } = useCustomize();
  const isCoCalcCom = kucalc === KUCALC_COCALC_COM;
  const showShareLinks = typeof dns === "string" && isCoCalcCom;

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

  function reanderOpenLink() {
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
      <Space size="middle" direction="horizontal">
        <A
          key="tweet"
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
            title
          )}&url=${encodeURIComponent(
            `https://${dns}${permalink}`
          )}&via=cocalc_com`}
          style={{ color: COLORS.ANTD_LINK_BLUE, ...bottomLinkStyle }}
        >
          <Icon name="twitter" />
          {text ? " Tweet" : ""}
        </A>
        <A
          key="facebook"
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
            `https://${dns}${permalink}`
          )}`}
          style={{ ...bottomLinkStyle }}
        >
          <Icon name="facebook" />
          {text ? " Share" : ""}
        </A>
      </Space>
    );
  }

  function actions() {
    const actions = [reanderOpenLink()];
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

  function renderTags() {
    return <NewsTags tags={tags} onTagClick={onTagClick} />;
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
        <Markdown value={text} style={{ ...style, minHeight: "30vh" }} />
        {url && (
          <Paragraph style={{ textAlign: "center" }}>
            {readMoreLink(false, true)}
          </Paragraph>
        )}
        <Paragraph
          style={{
            fontSize: "150%",
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
          <Markdown value={text} style={style} />
        </Card>
      </>
    );
  }
}

interface NewsTagsProps {
  tags?: string[];
  onTagClick?: (tag: string) => void;
  style?: CSS;
  styleTag?: CSS;
}

export function NewsTags({ tags, onTagClick, style, styleTag }: NewsTagsProps) {
  if (tags == null || !Array.isArray(tags) || tags.length === 0) return null;

  const router = useRouter();

  function onTagClickStandalone(tag: string) {
    router.push(`/news?tag=${tag}`);
  }

  return (
    <Space size={[0, 4]} wrap style={style}>
      {tags.sort().map((tag) => (
        <Tag
          color={getRandomColor(tag)}
          key={tag}
          style={{ cursor: "pointer", ...styleTag }}
          onClick={() => (onTagClick ?? onTagClickStandalone)(tag)}
        >
          {tag}
        </Tag>
      ))}
    </Space>
  );
}
