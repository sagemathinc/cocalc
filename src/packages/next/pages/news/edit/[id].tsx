/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import getPool from "@cocalc/database/pool";
import { Icon } from "@cocalc/frontend/components/icon";
import { capitalize } from "@cocalc/util/misc";
import { slugURL } from "@cocalc/util/news";
import {
  CHANNELS,
  CHANNELS_DESCRIPTIONS,
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
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
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
      ? { ...news, date }
      : {
          hide: false,
          title: "",
          text: "",
          url: "",
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
    form.validateFields();
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      // send data, but convert date field to epoch seconds
      const raw = { ...data, id, date: data.date.unix() };
      const ret = await apiPost("/news/edit", raw);
      if (ret == null || ret.id == null) {
        throw Error("Problem saving news item – no id returned.");
      }
      if (isNew) {
        router.push(`/news/edit/${ret.id}`);
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
    if (saved == null) return;
    return (
      <Alert
        banner
        type="success"
        icon={<Icon name="check" />}
        message={
          <>
            <A href={slugURL({ ...data, id, date: data.date.unix() })}>
              Saved News id={saved}
            </A>
            .
          </>
        }
      />
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
            <DatePicker showTime={true} allowClear={false} />
          </Form.Item>
          <Form.Item
            label="Channel"
            name="channel"
            rules={[{ required: true }]}
          >
            <Select>
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
            label="Message"
            name="text"
            extra={`Markdown is supported. Insert images via ![](url), e.g. shared on ${siteName} itself.`}
            rules={[{ required: true, min: 1 }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item
            label="URL"
            name="url"
            rules={[{ required: false, type: "url" }]}
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
              <Button href={slugURL({ ...data, id, date: data.date.unix() })}>
                Cancel
              </Button>
            </Space>
            <Divider type="horizontal" />
            {error && <Alert type="error" message={error} />}
            {saving && <Loading />}
            {saved && renderSaved()}
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

  const title = `${siteName} / News / Edit / ${isNew ? "new" : `${id}`}`;

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
            <Breadcrumb style={{ margin: "30px 0" }}>
              <Breadcrumb.Item>
                <A href="/">{siteName}</A>
              </Breadcrumb.Item>
              <Breadcrumb.Item>
                <A href="/news">News</A>
              </Breadcrumb.Item>
              <Breadcrumb.Item>{isNew ? "new" : `#${id}`}</Breadcrumb.Item>
            </Breadcrumb>
            {content()}
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

// ::timestamptz because if your server is not in UTC, it will be converted to UTC
// and the UTC epoch timestamp will be used in the browser client as the basis, adding your TZ offset
const Q = `
SELECT
  id, channel, title, text, url, hide, tags,
  extract(epoch from date::timestamptz)::INTEGER as date
FROM news
WHERE id = $1`;

export async function getServerSideProps(context) {
  const pool = getPool("long");
  const { id } = context.query;

  if (id === "new") {
    return await withCustomize({ context, props: { news: null } });
  } else if (id != null && Number.isInteger(Number(id))) {
    try {
      const news = (await pool.query(Q, [id])).rows[0];
      if (news != null) {
        return await withCustomize({ context, props: { news } });
      }
    } catch (err) {
      console.log("Error loading news item", err.message);
    }
  }

  return { notFound: true };
}
