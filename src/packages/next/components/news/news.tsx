/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Card, Space, Tooltip } from "antd";
import { Fragment } from "react";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { capitalize, plural } from "@cocalc/util/misc";
import { slugURL } from "@cocalc/util/news";
import { COLORS } from "@cocalc/util/theme";
import {
  CHANNELS_DESCRIPTIONS,
  CHANNELS_ICONS,
  NewsType,
} from "@cocalc/util/types/news";
import { CSS, Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import TimeAgo from "timeago-react";
import { useDateStr } from "./useDateStr";

const STYLE: CSS = {
  borderColor: COLORS.GRAY_M,
  boxShadow: "0 0 0 1px rgba(0,0,0,.1), 0 3px 3px rgba(0,0,0,.3)",
} as const;

interface Props {
  // NewsWithFuture with optional future property
  news: NewsType & { future?: boolean };
  dns?: string;
  showEdit?: boolean;
  small?: boolean; // limit height, essentially
  standalone?: boolean; // default false
  historyMode?: boolean; // default false
}

export function News(props: Props) {
  const {
    news,
    showEdit = false,
    small = false,
    standalone = false,
    historyMode = false,
    dns,
  } = props;
  const dateStr = useDateStr(news);
  const permalink = slugURL(news);

  const bottomLinkStyle: CSS = {
    color: COLORS.ANTD_LINK_BLUE,
    ...(standalone ? { fontSize: "125%", fontWeight: "bold" } : {}),
  };

  function editLink() {
    return (
      <A
        key="edit"
        href={`/news/edit/${news.id}`}
        style={{
          ...bottomLinkStyle,
          color: COLORS.ANTD_RED_WARN,
        }}
      >
        <Icon name="edit" /> Edit
      </A>
    );
  }

  function readMoreLink(iconOnly = false) {
    return (
      <A
        key="url"
        href={news.url}
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
            news.title
          )}&url=${encodeURIComponent(
            `https://${dns}${permalink}`
          )}&via=cocalc_com`}
          style={{ color: COLORS.ANTD_LINK_BLUE, ...bottomLinkStyle }}
        >
          <Icon name="twitter" />
          {text ? " Tweet" : ""}
        </A>
        {/* link to share on facebook */}
        <A
          key="facebook"
          href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
            `https://${dns}${permalink}`
          )}&quote=${encodeURIComponent(news.title)}`}
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
    if (news.url) actions.push(readMoreLink());
    if (showEdit) actions.push(editLink());
    if (typeof dns === "string") actions.push(shareLinks());
    return actions;
  }

  const style = small ? { height: "200px", overflow: "auto" } : undefined;

  function future() {
    if (news.future) {
      const { date } = news;
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

  function hidden() {
    if (news.hide) {
      return (
        <Alert
          banner
          type="error"
          message="Hidden, will not be shown to users."
        />
      );
    }
  }

  function extra() {
    return (
      <Tooltip
        title={
          <>
            {capitalize(news.channel)}: {CHANNELS_DESCRIPTIONS[news.channel]}
          </>
        }
      >
        <Icon name={CHANNELS_ICONS[news.channel] as IconName} />
      </Tooltip>
    );
  }

  function title() {
    return (
      <>
        {dateStr}: <A href={permalink}>{news.title}</A>
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
              <A key={ts} href={`/news/${news.id}/${ts}`}>
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
    return (
      <>
        <Title level={2}>
          [{dateStr}] {news.title}
          {news.url && (
            <div style={{ float: "right" }}>{readMoreLink(true)}</div>
          )}
        </Title>
        {future()}
        {hidden()}
        <Markdown value={news.text} style={{ ...style, minHeight: "50vh" }} />
        <Paragraph
          style={{
            fontSize: "150%",
            fontWeight: "bold",
            textAlign: "center",
          }}
        >
          <Space size="middle" direction="horizontal">
            {showEdit ? editLink() : undefined}
            {news.url ? readMoreLink() : undefined}
            {shareLinks(true)}
          </Space>
        </Paragraph>
        {renderHistory()}
      </>
    );
  } else {
    return (
      <>
        <Card title={title()} style={STYLE} extra={extra()} actions={actions()}>
          {future()}
          {hidden()}
          <Markdown value={news.text} style={style} />
        </Card>
      </>
    );
  }
}
