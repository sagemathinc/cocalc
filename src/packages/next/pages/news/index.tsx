/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Alert,
  Col,
  Divider,
  Input,
  Layout,
  Radio,
  Row,
  Space,
  Tooltip,
} from "antd";
import { useEffect, useState } from "react";

import { getIndex } from "@cocalc/database/postgres/news";
import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";
import {
  CHANNELS,
  CHANNELS_DESCRIPTIONS,
  CHANNELS_ICONS,
  Channel,
} from "@cocalc/util/types/news";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { News } from "components/news/news";
import type { NewsWithStatus } from "components/news/types";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import withCustomize from "lib/with-customize";
import { GetServerSidePropsContext } from "next";
import Image from "components/landing/image";
import { useRouter } from "next/router";
import jsonfeedIcon from "public/jsonfeed.png";
import rssIcon from "public/rss.svg";

// news shown per page
const SLICE_SIZE = 10;

type ChannelAll = Channel | "all";

function isChannelAll(s?: string): s is ChannelAll {
  return s != null && (CHANNELS.includes(s as Channel) || s === "all");
}
interface Props {
  customize: CustomizeType;
  news: NewsWithStatus[];
  offset: number;
  tag?: string; // used for searching for a tag, used on /news/[id] standalone pages
  channel?: string; // a channel to filter by
  search?: string; // a search query
}

export default function AllNews(props: Props) {
  const {
    customize,
    news,
    offset,
    tag,
    channel: initChannel,
    search: initSearch,
  } = props;
  const { siteName } = customize;
  const router = useRouter();
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin;

  const [channel, setChannel] = useState<ChannelAll>(
    isChannelAll(initChannel) ? initChannel : "all",
  );
  const [search, setSearchState] = useState<string>(initSearch ?? "");

  // when loading the page, we want to set the search to the given tag
  useEffect(() => {
    if (tag) setSearchState(`#${tag}`);
  }, []);

  function setQuery(param: "tag" | "search" | "channel", value: string) {
    const query = { ...router.query };
    switch (param) {
      case "tag":
        delete query.search;
        break;
      case "search":
        delete query.tag;
        break;
    }

    if (param === "channel" && value === "all") {
      delete query.channel;
    } else if (value) {
      query[param] = param === "tag" ? value.slice(1) : value;
    } else {
      delete query[param];
    }
    router.replace({ query }, undefined, { shallow: true });
  }

  // when the filter changes, change the channel=[filter] query parameter of the url
  useEffect(() => {
    setQuery("channel", channel);
  }, [channel]);

  function setTag(tag: string) {
    setSearchState(tag);
    setQuery("tag", tag);
  }

  function setSearch(search: string) {
    setSearchState(search);
    setQuery("search", search);
  }

  function renderFilter() {
    return (
      <Row justify="space-between" gutter={15}>
        <Col>
          <Radio.Group
            defaultValue={"all"}
            value={channel}
            buttonStyle="solid"
            onChange={(e) => setChannel(e.target.value)}
          >
            <Radio.Button value="all">Show All</Radio.Button>
            {CHANNELS.filter((c) => c !== "event").map((c) => (
              <Tooltip key={c} title={CHANNELS_DESCRIPTIONS[c]}>
                <Radio.Button key={c} value={c}>
                  <Icon name={CHANNELS_ICONS[c] as IconName} /> {capitalize(c)}
                </Radio.Button>
              </Tooltip>
            ))}
          </Radio.Group>
        </Col>
        <Col>
          <Input.Search
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            status={search ? "warning" : undefined}
            addonBefore="Filter"
            placeholder="Search text…"
            allowClear
          />
        </Col>
      </Row>
    );
  }

  function renderNews() {
    const rendered = news
      // only admins see future, hidden, and expired news
      .filter((n) => isAdmin || (!n.future && !n.hide && !n.expired))
      .filter((n) => channel === "all" || n.channel == channel)
      .filter((n) => {
        if (search === "") return true;
        const txt = search.toLowerCase();
        return (
          // substring match for title and text
          n.title.toLowerCase().includes(txt) ||
          n.text.toLowerCase().includes(txt) ||
          // exact match for tags
          n.tags?.map((t) => `#${t.toLowerCase()}`).some((t) => t == txt)
        );
      })
      .map((n) => (
        <Col key={n.id} xs={24} sm={24} md={12}>
          <News
            news={n}
            showEdit={isAdmin}
            small
            onTagClick={(tag) => {
              const ht = `#${tag}`;
              // that's a toggle: if user clicks again on the same tag, remove the search filter
              search === ht ? setTag("") : setTag(ht);
            }}
          />
        </Col>
      ));
    if (rendered.length === 0) {
      return <Alert banner type="info" message="No news found" />;
    } else {
      return <Row gutter={[30, 30]}>{rendered}</Row>;
    }
  }

  function adminInfo() {
    if (!isAdmin) return;
    return (
      <Alert
        banner={true}
        type="warning"
        message={
          <>
            Admin only: <A href="/news/edit/new">Create News Item</A>
          </>
        }
      />
    );
  }

  function titleFeedIcons() {
    return (
      <Space direction="horizontal" size="middle" style={{ float: "right" }}>
        <A href="/news/rss.xml" external>
          <Image src={rssIcon} width={32} height={32} alt="RSS Feed" />
        </A>
        <A href="/news/feed.json" external>
          <Image
            src={jsonfeedIcon}
            width={32}
            height={32}
            alt="JSON Feed"
            style={{ borderRadius: "5px" }}
          />
        </A>
      </Space>
    );
  }

  function content() {
    return (
      <>
        <Title level={1}>
          <Icon name="file-alt" /> {siteName} News
          {titleFeedIcons()}
        </Title>
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Paragraph>
            <div style={{ float: "right" }}>{renderSlicer("small")}</div>
            Recent news about {siteName}. You can also subscribe via{" "}
            {/* This is intentionally a regular link, to "break out" of next.js */}
            <A href="/news/rss.xml" external>
              <Image src={rssIcon} width={16} height={16} alt="RSS Feed" /> RSS
              Feed
            </A>{" "}
            or{" "}
            <A href="/news/feed.json" external>
              <Image
                src={jsonfeedIcon}
                width={16}
                height={16}
                alt="JSON Feed"
              />{" "}
              JSON Feed
            </A>
            .
          </Paragraph>
          {renderFilter()}
          {adminInfo()}
          {renderNews()}
        </Space>
      </>
    );
  }

  function slice(dir: "future" | "past") {
    const next = offset + (dir === "future" ? -1 : 1) * SLICE_SIZE;
    const newOffset = Math.max(0, next);
    const query = { ...router.query };
    if (newOffset === 0) {
      delete query.offset;
    } else {
      query.offset = `${newOffset}`;
    }
    router.push({ query });
  }

  function renderSlicer(size?: "small") {
    //if (news.length < SLICE_SIZE && offset === 0) return;
    const extraProps = size === "small" ? { size } : {};
    return (
      <>
        <Radio.Group optionType="button" {...extraProps}>
          <Radio.Button
            disabled={news.length < SLICE_SIZE}
            onClick={() => slice("past")}
          >
            <Icon name="arrow-left" /> Older
          </Radio.Button>
          <Radio.Button disabled={offset === 0} onClick={() => slice("future")}>
            Newer <Icon name="arrow-right" />
          </Radio.Button>
        </Radio.Group>
      </>
    );
  }

  function renderFeeds() {
    const iconSize = 20;
    return (
      <>
        <Divider
          orientation="center"
          style={{
            marginTop: "60px",
            textAlign: "center",
          }}
        />
        <div
          style={{
            marginTop: "60px",
            marginBottom: "60px",
            textAlign: "center",
          }}
        >
          <Space direction="horizontal" size="large">
            <A href="/news/rss.xml" external>
              <Image
                src={rssIcon}
                width={iconSize}
                height={iconSize}
                alt="RSS Feed"
              />{" "}
              RSS
            </A>
            <A href="/news/feed.json" external>
              <Image
                src={jsonfeedIcon}
                width={iconSize}
                height={iconSize}
                alt="Json Feed"
              />{" "}
              JSON
            </A>
          </Space>
        </div>
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title={`${siteName} News`} />
      <Layout>
        <Header page="news" />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              minHeight: "75vh",
              maxWidth: MAX_WIDTH,
              padding: "30px 15px",
              margin: "0 auto",
            }}
          >
            {content()}
            <div style={{ marginTop: "60px", textAlign: "center" }}>
              {renderSlicer()}
            </div>
            {renderFeeds()}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const { query } = context;
  const tag = typeof query.tag === "string" ? query.tag : null;
  const channel = typeof query.channel === "string" ? query.channel : null;
  const search = typeof query.search === "string" ? query.search : null;
  const offsetVal = Number(query.offset ?? 0);
  const offset = Math.max(0, Number.isNaN(offsetVal) ? 0 : offsetVal);
  const news = await getIndex(SLICE_SIZE, offset);
  return await withCustomize({
    context,
    props: { news, offset, tag, channel, search },
  });
}
