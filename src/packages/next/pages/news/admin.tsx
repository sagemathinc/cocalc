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
import { useEffect, useState } from "react";

import getPool from "@cocalc/database/pool";
import Markdown from "@cocalc/frontend/editors/slate/static-markdown";
import { COLORS } from "@cocalc/util/theme";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import apiPost from "lib/api/post";
import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";
import useProfile from "lib/hooks/profile";
import { NewsType } from "lib/types/news";
import withCustomize from "lib/with-customize";

interface Props {
  customize: CustomizeType;
  news?: NewsType[];
}

export default function News(props: Props) {
  const { customize, news } = props;
  const { siteName } = customize;
  const profile = useProfile({ noCache: true });
  const isAdmin = profile?.is_admin;

  const [form] = Form.useForm();

  const [data, setData] = useState({
    title: "",
    text: "",
    url: "",
    channel: "announcement",
    time: new Date(),
  });
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [invalid, setInvalid] = useState<boolean>(false);

  useEffect(() => {
    form.setFieldsValue(data);
    form.validateFields();
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiPost("/news/edit", data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
      setError("");
    }
  }

  function edit() {
    return (
      <>
        <Title level={2}>Edit News</Title>
        <pre>{JSON.stringify(news, null, 2)}</pre>
      </>
    );
  }

  function create() {
    return (
      <>
        <Title level={2}>Create News</Title>
        <Form
          form={form}
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
          <Form.Item label="date" name="Date" rules={[{ required: true }]}>
            <DatePicker showTime={false} />
          </Form.Item>
          <Form.Item
            label="Channel"
            name="channel"
            rules={[{ required: true }]}
          >
            <Select>
              <Select.Option value="announcement">Announcement</Select.Option>
              <Select.Option value="news">News</Select.Option>
              <Select.Option value="platform">Platform</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            label="Message"
            name="text"
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
    return (
      <>
        <Title level={2}>Admin Zone</Title>
        {news != null ? edit() : create()}
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
            <Title level={1}>{siteName} – News – Admin Zone</Title>
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
            `SELECT id, time, title, text, url
            FROM news
            WHERE id = $1`,
            [id]
          )
        ).rows[0]
      : null;

  return await withCustomize({ context, props: { news } });
}
