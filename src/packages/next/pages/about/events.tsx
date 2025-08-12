import { Alert, Button, Divider, Flex, Layout, Typography } from "antd";
import { GetServerSidePropsContext } from "next";

import {
  getPastNewsChannelItems,
  getUpcomingNewsChannelItems,
} from "@cocalc/database/postgres/news";

import { Icon } from "@cocalc/frontend/components/icon";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { NewsItem } from "@cocalc/util/dist/types/news";
import { COLORS } from "@cocalc/util/theme";

import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import IndexList, { DataSource } from "components/landing/index-list";
import { CSS } from "components/misc";
import A from "components/misc/A";
import { TagList } from "components/news/news";
import type { NewsWithStatus } from "components/news/types";
import { useDateStr } from "components/news/useDateStr";

import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import withCustomize from "lib/with-customize";

const BODY_STYLE: CSS = {
  maxHeight: "max(300px, 75vh)",
  overflowY: "auto",
} as const;
interface TitleComponentProps {
  newsItem: NewsWithStatus;
  showHelpTicket?: boolean;
}

const TitleComponent = ({ newsItem, showHelpTicket }: TitleComponentProps) => (
  <Flex justify="space-between" align="baseline" wrap="wrap">
    <Flex vertical flex={1}>
      <Typography.Title
        level={5}
        style={{
          margin: 0,
        }}
      >
        <span style={{ color: COLORS.GRAY }}>
          {`${useDateStr(newsItem, false, "MMM YYYY")}`}
        </span>{" "}
        {newsItem.title}
        {newsItem.tags ? (
          <span style={{ float: "right" }}>
            <TagList mode="event" tags={newsItem.tags} />
          </span>
        ) : undefined}
      </Typography.Title>
    </Flex>
    {showHelpTicket && (
      <Flex flex={0}>
        <A
          target="_blank"
          href={`/support/new?${new URLSearchParams({
            body: `Hi there! I'd love to meet at ${newsItem.title}.`,
            subject: `Meeting Request: ${newsItem.title}`,
            title: "Event Visit",
            type: "question",
          })}`}
        >
          <Button
            style={{
              fontSize: "14px",
            }}
          >
            👋 Come say hi!
          </Button>
        </A>
      </Flex>
    )}
  </Flex>
);

interface EventsProps {
  customize: CustomizeType;
  upcomingEvents: NewsWithStatus[];
  pastEvents: NewsWithStatus[];
}

export default function Events({
  customize,
  upcomingEvents,
  pastEvents,
}: EventsProps) {
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin;

  function eventFooter(eventItem: NewsItem) {
    return (
      isAdmin && (
        <Flex justify="center">
          <A
            key={`edit-event-${eventItem.id}`}
            href={`/news/edit/${eventItem.id}`}
            style={{
              color: COLORS.ANTD_RED_WARN,
              fontWeight: "bold",
            }}
          >
            <Icon name="edit" /> Edit
          </A>
        </Flex>
      )
    );
  }

  const upcomingEventsDataSource = upcomingEvents.map((upcomingEvent) => ({
    link: upcomingEvent.url,
    linkText: (
      <>
        Event Website <Icon name="external-link" />
      </>
    ),
    title: <TitleComponent newsItem={upcomingEvent} showHelpTicket />,
    description: (
      <>
        <Markdown value={upcomingEvent.text} style={BODY_STYLE} />
        {eventFooter(upcomingEvent)}
      </>
    ),
  })) as DataSource;

  const pastEventsDataSource = pastEvents.map((pastEvent) => ({
    link: pastEvent.url,
    linkText: (
      <>
        Event Website <Icon name="external-link" />
      </>
    ),
    title: <TitleComponent newsItem={pastEvent} />,
    description: (
      <>
        <Markdown value={pastEvent.text} style={BODY_STYLE} />
        {eventFooter(pastEvent)}
      </>
    ),
  })) as DataSource;

  return (
    <Customize value={customize}>
      <Head title="Where To Find Us" />
      <Layout>
        <Header page="about" subPage="events" />
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
                  <Icon name="global" style={{ marginRight: "30px" }} />
                  Upcoming Events
                </>
              }
              description={
                <>
                  {isAdmin && (
                    <Alert
                      style={{
                        marginTop: "12px",
                        marginBottom: "12px",
                      }}
                      banner={true}
                      type="warning"
                      message={
                        <>
                          Admin only:{" "}
                          <A href="/news/edit/new?channel=event">
                            Create Event
                          </A>
                        </>
                      }
                    />
                  )}
                  We are committed to engaging with the scientific community
                  this upcoming year. Here, you can stay updated with where to
                  find us "out in the wild." We have recently participated as
                  exhibitors for CoCalc at popular events such as the Joint
                  Mathematics Meeting and SIAM's Conference on Computational
                  Science and Engineering. We are beyond excited to catch up
                  with you and tell you all about CoCalc's latest features and
                  our innovative plans for the future!!
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
          <Footer />
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
