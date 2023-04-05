/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import {
  Alert,
  Button,
  Card,
  Col,
  DatePicker,
  Divider,
  Form,
  Input,
  Layout,
  Row,
  Select,
} from "antd";
import dayjs from "dayjs";
import { useEffect, useState } from "react";

import getPool from "@cocalc/database/pool";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { COLORS } from "@cocalc/util/theme";
import { CHANNELS_DESCRIPTIONS, NewsType } from "@cocalc/util/types/news";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import apiPost from "lib/api/post";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import withCustomize from "lib/with-customize";

interface Props {
  customize: CustomizeType;
  news?: NewsType;
}

type NewsTypeForm = Omit<NewsType, "date"> & { date: dayjs.Dayjs };

export default function News(props: Props) {
  const { customize, news } = props;
  const { siteName } = customize;
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin;

  const [form] = Form.useForm();

  const init: NewsTypeForm =
    news != null
      ? { ...news, date: dayjs(news.date) }
      : {
          title: "",
          text: "",
          url: "",
          channel: "news",
          date: dayjs(),
        };

  const [data, setData] = useState<NewsTypeForm>(init);

  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [invalid, setInvalid] = useState<boolean>(false);
  const [saved, setSaved] = useState<number | undefined>();

  useEffect(() => {
    form.setFieldsValue(data);
    form.validateFields();
  }, [data]);

  async function save() {
    setSaving(true);
    try {
      // send data, but convert date field to epoch seconds
      const raw = { ...data, date: data.date.unix() };
      const ret = await apiPost("/news/edit", raw);
      if (ret == null || ret.id == null) {
        throw Error("Problem saving news item – no id returned.");
      }
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
        type="success"
        message={
          <>
            Saved id="{saved}". <A href={`/news/${saved}`}>View it here</A>.
          </>
        }
      />
    );
  }

  function edit() {
    return (
      <>
        <Title level={2}>
          News Item ({data.id != null ? `id=${data.id}` : "new"})
        </Title>
        <Form
          form={form}
          initialValues={data}
          labelCol={{ span: 4 }}
          wrapperCol={{ span: 20 }}
          onValuesChange={(_, allValues) => setData(allValues)}
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
              <Select.Option value="news">
                News ({CHANNELS_DESCRIPTIONS["news"]})
              </Select.Option>
              <Select.Option value="announcement">
                Announcement ({CHANNELS_DESCRIPTIONS["announcement"]})
              </Select.Option>
              <Select.Option value="feature">
                Feature ({CHANNELS_DESCRIPTIONS["feature"]})
              </Select.Option>
              <Select.Option value="platform">
                Platform ({CHANNELS_DESCRIPTIONS["platform"]})
              </Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="Message"
            name="text"
            extra={`Markdown is supported. Insert images via ![](url), e.g. shared on ${siteName} itself.`}
            rules={[{ required: true, min: 10 }]}
          >
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item
            label="URL"
            name="url"
            rules={[{ required: false, type: "url" }]}
          >
            <Input />
          </Form.Item>
        </Form>
        <Divider />
        <Row gutter={30}>
          <Col span={12}>
            <Paragraph>Preview:</Paragraph>
            <Paragraph>
              <Card
                title={data.title}
                style={{ borderColor: COLORS.GRAY_D }}
                extra={`${data.channel}`}
              >
                <Markdown value={data.text} />
                {data.url && <A href={data.url}>Read more</A>}
              </Card>
            </Paragraph>
          </Col>
          <Col span={12}>
            <Button onClick={save} disabled={saving || invalid} type="primary">
              Save
            </Button>
            <Divider type="horizontal" />
            {error && <Alert type="error" message={error} />}
          </Col>
        </Row>
      </>
    );
  }

  function content() {
    if (!isAdmin) {
      return <Alert type="error" message="Not authorized" />;
    }
    return <>{saved ? renderSaved() : edit()}</>;
  }

  const title = `${siteName} / News / Admin Zone`;

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
            <Paragraph>
              back to <A href="/news"> main news page</A>
            </Paragraph>
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
  const { id } = context.query;
  const news =
    id != null
      ? (
          await pool.query(
            `SELECT id, extract(epoch from date) as date, title, text, url
            FROM news
            WHERE id = $1`,
            [id]
          )
        ).rows[0]
      : null;

  return await withCustomize({ context, props: { news } });
}
