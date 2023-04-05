/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Card, Divider, Layout } from "antd";

import getPool from "@cocalc/database/pool";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { COLORS } from "@cocalc/util/theme";
import { NewsType } from "@cocalc/util/types/news";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Title } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import withCustomize from "lib/with-customize";

interface Props {
  customize: CustomizeType;
  news: NewsType;
}

export default function News(props: Props) {
  const { customize, news } = props;
  const { siteName } = customize;
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin;

  if (news == null) {
    // 404 not found error
    return;
  }

  function content() {
    return (
      <>
        <Card
          title={news.title}
          style={{ borderColor: COLORS.GRAY_D }}
          extra={`${news.channel}`}
        >
          <Markdown value={news.text} />
          {news.url && <A href={news.url}>Read more</A>}
        </Card>
      </>
    );
  }

  function edit() {
    if (!isAdmin) return;
    return (
      <>
        <Divider />
        <Title level={2}>
          <A href={`/news/edit?id=${news.id}`}>
            Edit id=${news.id} (Admin only)
          </A>
        </Title>
      </>
    );
  }

  const title = `${siteName} - New – ${news.date} `;

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
              paddingTop: "30px",
              margin: "0 auto",
            }}
          >
            <Title level={1}>{title}</Title>
            {content()}
            {edit()}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const pool = getPool("long");
  const { id } = context.query;

  // if id is null or not an integer, return { notFound: true }
  if (id == null || !Number.isInteger(Number(id))) {
    return {
      notFound: true,
    };
  }

  const news = (
    await pool.query(
      `SELECT id, extract(epoch from date) as date, title, text, url
        FROM news
        WHERE id = $1`,
      [id]
    )
  ).rows[0];

  if (news == null) {
    return {
      notFound: true,
    };
  }

  return await withCustomize({ context, props: { news } });
}
