import { Button, Divider, Flex, Layout, Typography } from "antd";
import { GetServerSidePropsContext } from "next";

import {
  getPastNewsChannelItems,
  getUpcomingNewsChannelItems
} from "@cocalc/database/postgres/news";

import { Icon } from "@cocalc/frontend/components/icon";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { COLORS } from "@cocalc/util/theme";

import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import IndexList, { DataSource } from "components/landing/index-list";
import A from "components/misc/A";
import type { NewsWithFuture } from "components/news/types";

import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import withCustomize from "lib/with-customize";
import { useDateStr } from "../../components/news/useDateStr";

interface TitleComponentProps {
  newsItem: NewsWithFuture;
  showHelpTicket?: boolean;
}

const TitleComponent = ({ newsItem, showHelpTicket }: TitleComponentProps) => (
  <Flex
    justify="space-between"
    align="baseline"
    wrap="wrap"
  >
    <Flex vertical>
      <Typography.Title
        level={5}
        style={{
          margin: 0,
        }}
      >
        <span style={{ color: COLORS.GRAY }}>
          {`${useDateStr(newsItem, false, "MMM YYYY")}`}
        </span> {newsItem.title}
      </Typography.Title>
    </Flex>
    {showHelpTicket && (
      <A
        target="_blank"
        href={`/support/new?${new URLSearchParams({
          body: `Hi there! I'd love to meet at ${newsItem.title}.`,
          subject: `Meeting Request: ${newsItem.title}`,
          title: "Event Visit",
          type: "question",
        })}`}
      >
        <Button style={{
          fontSize: "14px"
        }}>👋 Come say hi!</Button>
      </A>
    )}
  </Flex>
);

interface EventsProps {
  customize: CustomizeType;
  upcomingEvents: NewsWithFuture[];
  pastEvents: NewsWithFuture[];
}

export default function Events({ customize, upcomingEvents, pastEvents}: EventsProps) {
  const upcomingEventsDataSource = upcomingEvents.map((upcomingEvent) => ({
    link: upcomingEvent.url,
    linkText: <>Event Website <Icon name="external-link" /></>,
    title: <TitleComponent newsItem={upcomingEvent} showHelpTicket />,
    description: <Markdown value={upcomingEvent.text} />,
  })) as DataSource;

  const pastEventsDataSource = pastEvents.map((pastEvent) => ({
    link: pastEvent.url,
    linkText: <>Event Website <Icon name="external-link" /></>,
    title: <TitleComponent newsItem={pastEvent} />,
    description: <Markdown value={pastEvent.text} />,
  })) as DataSource;

  return (
    <Customize value={customize}>
      <Head title="Where To Find Us"/>
      <Layout>
        <Header page="about" subPage="events"/>
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              maxWidth: MAX_WIDTH,
              margin: "15px auto",
              padding: "15px",
              backgroundColor: "white",
            }}
          >
            <IndexList
              title={
                <>
                  <Icon name="global" style={{ marginRight: "30px" }}/>
                  Upcoming Events
                </>
              }
              description={
                <>
                  We are committed to engaging with the scientific community this upcoming year.
                  Here, you can stay updated with where to find us "out in the wild." We have
                  recently participated as exhibitors for CoCalc at popular events such as the
                  Joint Mathematics Meeting and SIAM's Conference on Computational Science and
                  Engineering. We are beyond excited to catch up with you and tell you all about
                  CoCalc's latest features and our innovative plans for the future!!
                </>
              }
              dataSource={upcomingEventsDataSource}
            />
            <Divider>Past Events</Divider>
            <IndexList
              title={<></>}
              description={<></>}
              dataSource={pastEventsDataSource}
            />
          </div>
          <Footer/>
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  return await withCustomize({
    context,
    props: {
      upcomingEvents: await getUpcomingNewsChannelItems("event"),
      pastEvents: await getPastNewsChannelItems("event"),
    },
  });
}
