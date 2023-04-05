/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";

import getPool from "@cocalc/database/pool";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import type { NewsType } from "@cocalc/util/types/news";
import withCustomize from "lib/with-customize";

interface NewsWithFuture extends NewsType {
  inFuture: boolean;
}

interface Props {
  customize: CustomizeType;
  news: NewsWithFuture[];
}

export default function News(props: Props) {
  const { customize, news } = props;
  const { siteName } = customize;
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin;

  function content() {
    return (
      <>
        <Title level={1}>{siteName} News</Title>
        {isAdmin && (
          <Paragraph>
            Admin: <A href="/news/edit">Edit/Create News</A>
          </Paragraph>
        )}
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(
            news.filter((n) => !isAdmin && !n.inFuture),
            null,
            2
          )}
        </pre>
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title={`${siteName} News`} />
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
            {content()}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const pool = getPool("long");
  const { rows } = await pool.query(
    `SELECT id, extract(epoch from date) as date, title, text, url, date >= NOW() as inFuture
    FROM news
    WHERE date >= NOW() - '6 months'::interval
    ORDER BY date DESC
    LIMIT 100`
  );

  return await withCustomize({ context, props: { news: rows } });
}
