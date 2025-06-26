/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import {
  Alert,
  Breadcrumb,
  Button,
  Checkbox,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  Layout,
  Row,
  Select,
  Space,
} from "antd";
import dayjs from "dayjs";
import { GetServerSidePropsContext } from "next";
import { useRouter } from "next/router";
import { useEffect, useState, type JSX } from "react";

import { getNewsItem } from "@cocalc/database/postgres/news";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";
import { slugURL } from "@cocalc/util/news";
import {
  CHANNELS,
  CHANNELS_DESCRIPTIONS,
  Channel,
  NewsItem,
} from "@cocalc/util/types/news";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { News } from "components/news/news";
import Loading from "components/share/loading";
import apiPost from "lib/api/post";
import { MAX_WIDTH, NOT_FOUND } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import { extractID } from "lib/news";
import withCustomize from "lib/with-customize";

interface Props {
  customize: CustomizeType;
  news?: NewsItem;
}

type NewsTypeForm = Omit<NewsItem, "date"> & { date: dayjs.Dayjs };

export default function EditNews(props: Props) {
  const { customize, news } = props;
  const router = useRouter();

  const id = news?.id; // this is set once, and never changes
  const isNew = id == null;
  const { siteName } = customize;
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin === true;

  const [form] = Form.useForm();

  const date: dayjs.Dayjs =
    typeof news?.date === "number" ? dayjs.unix(news.date) : dayjs();

  const init: NewsTypeForm =
    news != null
      ? { ...news, tags: news.tags ?? [], date }
      : {
          hide: false,
          title: "",
          text: "",
          url: "",
          tags: [],
          channel: "feature",
          date: dayjs(),
        };

  const [data, setData] = useState<NewsTypeForm>(init);

  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [invalid, setInvalid] = useState<boolean>(false);
  const [saved, setSaved] = useState<number | null>(null);

  useEffect(() => {
    form.setFieldsValue(data);

    // If we're creating a new item, set the channel from URL params (if such a param exists).
    // This is used when creating a new event from the events page.
    //
    if (isNew) {
      const { channel } = router.query;
      if (
        typeof channel === "string" &&
        CHANNELS.includes(channel as Channel)
      ) {
        form.setFieldValue("channel", channel);
      }
    }

    form.validateFields();
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      // send data, but convert date field to epoch seconds
      const next = { ...data, id, date: data.date.unix() };
      const { channel } = data;
      const ret = await apiPost("/news/edit", next);
      if (ret == null || ret.id == null) {
        throw Error("Problem saving news item – no id returned.");
      }
      if (channel === "event") {
        router.push("/about/events", undefined, { scroll: false });
      } else {
        router.push(
          slugURL({
            ...data,
            ...ret,
          }),
          undefined,
          { scroll: false },
        );
      }
      // this signals to the user that the save was successful
      setSaved(ret.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setError("");
    }
  }

  function renderSaved() {
    if (saving || saved == null) return;
    return (
      <Alert
        banner
        type="success"
        icon={<Icon name="check" />}
        message={
          <>
            <A href={slugURL({ ...data, id })}>Saved News id={saved}</A>.
          </>
        }
      />
    );
  }

  function explainChannel(channel: Channel): JSX.Element | string {
    switch (channel) {
      case "feature":
        return "Updates, modified features, general news, etc. The default category for all news.";
      case "announcement":
        return "Use this rarely, only once or twice a month.";
      case "about":
        return "This is the meta-level category.";
      case "event":
        return (
          "Let users know about upcoming company/conference events. These events are ONLY" +
          " shown in the About page and are filtered from normal news views."
        );
      default:
        return CHANNELS_DESCRIPTIONS[channel];
    }
  }

  function updateChannelParam(channel: string) {
    const { query } = router;

    router.replace(
      {
        query: {
          ...query,
          channel,
        },
      },
      undefined,
      { shallow: true, scroll: false },
    );
  }

  function edit() {
    return (
      <>
        <Title level={2}>
          {isNew ? "Create New News" : `Edit News #${id}`}
        </Title>
        <Form
          form={form}
          initialValues={data}
          labelCol={{ span: 4 }}
          wrapperCol={{ span: 20 }}
          onValuesChange={(_, allValues) => {
            setSaved(null);
            setData(allValues);
          }}
          onFieldsChange={() =>
            setInvalid(form.getFieldsError().some((e) => e.errors.length > 0))
          }
        >
          <Form.Item
            label="Title"
            name="title"
            rules={[{ required: true, min: 1 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label="Date"
            name="date"
            rules={[{ required: true }]}
            extra={`Future dates will not be shown until it is time. This date is in the ${
              form.getFieldValue("date")?.isAfter(dayjs()) ? "future" : "past"
            }.`}
          >
            <DatePicker changeOnBlur showTime={true} allowClear={false} />
          </Form.Item>
          <Form.Item
            label="Channel"
            name="channel"
            rules={[{ required: true }]}
            extra={explainChannel(data.channel)}
          >
            <Select onSelect={(value) => updateChannelParam(value)}>
              {CHANNELS.map((ch) => {
                return (
                  <Select.Option value={ch} key={ch}>
                    {capitalize(ch)} ({CHANNELS_DESCRIPTIONS[ch]})
                  </Select.Option>
                );
              })}
            </Select>
          </Form.Item>
          <Form.Item
            label="Tags"
            name="tags"
            rules={[{ required: false }]}
            extra={`Common ones are "jupyter", "latex" or "sagemath". Don't set too many, one is usually good enough.`}
          >
            <Select mode="tags" style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item
            label="Message"
            name="text"
            extra={`Markdown is supported. Insert images via ![](url), e.g. shared on ${siteName} itself.`}
            rules={[{ required: true, min: 1 }]}
          >
            <Input.TextArea
              rows={10}
              style={{ fontFamily: "monospace", fontSize: "90%" }}
            />
          </Form.Item>
          <Form.Item
            label="URL"
            name="url"
            rules={[{ required: false, type: "url" }]}
            extra={`optional, external URL, will be shown as "Read more" link.`}
          >
            <Input allowClear />
          </Form.Item>
          <Form.Item label="Hide" name="hide" valuePropName="checked">
            <Checkbox>If checked, will not be shown publicly.</Checkbox>
          </Form.Item>
        </Form>
        <Divider />
        <Row gutter={30}>
          <Col span={16}>
            <Paragraph>
              <News news={{ ...data, id, date: data.date.unix() }} />
            </Paragraph>
          </Col>
          <Col span={8}>
            <Space direction="horizontal" size="large">
              <Button
                onClick={save}
                disabled={saving || saved != null || invalid}
                type="primary"
              >
                {isNew ? "Create" : "Save"}
              </Button>
              <Button href={slugURL({ ...data, id })}>Cancel</Button>
            </Space>
            <Divider type="horizontal" />
            {error && <Alert type="error" message={error} />}
            {saving && <Loading />}
            {renderSaved()}
          </Col>
        </Row>
      </>
    );
  }

  function content() {
    if (profile == null) return <Loading />;
    if (!isAdmin) {
      return <Alert type="error" message="Not authorized" />;
    }
    return edit();
  }

  const title = `${siteName} / Edit News / ${isNew ? "new" : `${id}`}`;

  const items = [
    { key: "/", title: <A href="/">{siteName}</A> },
    { key: "/news", title: <A href="/news">News</A> },
    { key: "new", title: isNew ? "Create New" : `Edit #${id}` },
  ];

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
            <Breadcrumb style={{ margin: "30px 0" }} items={items} />
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
  const { id: idQ } = query;

  if (idQ === "new") {
    return await withCustomize({ context, props: { news: null } });
  }

  const id = extractID(idQ);
  if (id != null) {
    try {
      // false: bypasses cache
      const news = await getNewsItem(id, false);
      if (news != null) {
        return await withCustomize({ context, props: { news } });
      }
    } catch (err) {
      console.log("Error loading news item", err.message);
    }
  }

  return NOT_FOUND;
}
