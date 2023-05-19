/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert, Breadcrumb, Col, Layout, Radio, Row } from "antd";
import { useRouter } from "next/router";

import { getNewsItemUserPrevNext } from "@cocalc/database/postgres/news";
import { Icon } from "@cocalc/frontend/components/icon";
import { slugURL } from "@cocalc/util/news";
import { NewsPrevNext } from "@cocalc/util/types/news";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import A from "components/misc/A";
import { News } from "components/news/news";
import { NewsWithFuture } from "components/news/types";
import { useDateStr } from "components/news/useDateStr";
import Loading from "components/share/loading";
import { MAX_WIDTH, NOT_FOUND } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import { extractID } from "lib/news";
import withCustomize from "lib/with-customize";
import { GetServerSidePropsContext } from "next";

interface Props {
  customize: CustomizeType;
  news: NewsWithFuture;
  prev?: NewsPrevNext;
  next?: NewsPrevNext;
}

export default function NewsPage(props: Props) {
  const { customize, news, prev, next } = props;
  const { siteName } = customize;
  const router = useRouter();
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin;
  const dateStr = useDateStr(news);
  const permalink = slugURL(news);

  const title = `${news.title} – News – ${siteName}`;

  function future() {
    if (news.future && !isAdmin) {
      return (
        <Alert type="info" banner={true} message="News not yet published" />
      );
    }
  }

  function content() {
    if (profile == null) return <Loading />;
    if (!isAdmin && news.hide) {
      return <Alert type="error" message="Not authorized" />;
    }
    if (isAdmin || !news.future) {
      return <News news={news} showEdit={isAdmin} standalone />;
    }
  }

  function breadcrumb() {
    const items = [
      { key: "/", title: <A href="/">{siteName}</A> },
      { key: "/news", title: <A href="/news">News</A> },
      {
        key: "permalink",
        title: (
          <A href={permalink}>
            {isAdmin || (!news.future && !news.hide) ? (
              <>
                {dateStr}: {news.title}
              </>
            ) : (
              "Not Authorized"
            )}
          </A>
        ),
      },
    ];
    return <Breadcrumb items={items} />;
  }

  function olderNewer() {
    return (
      <Radio.Group buttonStyle="outline" size="small">
        <Radio.Button
          disabled={!prev}
          style={{ userSelect: "none" }}
          onClick={() => {
            prev && router.push(slugURL(prev));
          }}
        >
          <Icon name="arrow-left" /> Older
        </Radio.Button>
        <Radio.Button
          style={{ userSelect: "none" }}
          onClick={() => {
            router.push("/news");
          }}
        >
          <Icon name="arrow-up" /> Overview
        </Radio.Button>
        <Radio.Button
          disabled={!next}
          style={{ userSelect: "none" }}
          onClick={() => {
            next && router.push(slugURL(next));
          }}
        >
          <Icon name="arrow-right" /> Newer
        </Radio.Button>
      </Radio.Group>
    );
  }

  function renderTop() {
    return (
      <Row justify="space-between" gutter={15} style={{ margin: "30px 0" }}>
        <Col>{breadcrumb()}</Col>
        <Col>{olderNewer()}</Col>
      </Row>
    );
  }

  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header />
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
            {renderTop()}
            {future()}
            {content()}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const { query } = context;
  const id = extractID(query.id);
  if (id == null) return NOT_FOUND;

  try {
    const { news, prev, next } = await getNewsItemUserPrevNext(id);

    if (news == null) {
      throw new Error(`not found`);
    }
    return await withCustomize({
      context,
      props: { news, prev, next },
    });
  } catch (err) {
    console.warn(`Error getting news with id=${id}`, err);
  }

  return NOT_FOUND;
}
