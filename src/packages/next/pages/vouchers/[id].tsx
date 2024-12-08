/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useEffect, useMemo, useState } from "react";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import {
  Alert,
  Button,
  Card,
  Divider,
  Layout,
  Modal,
  Space,
  Table,
} from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import { Icon } from "@cocalc/frontend/components/icon";
import A from "components/misc/A";
import Loading from "components/share/loading";
import TimeAgo from "timeago-react";
import apiPost from "lib/api/post";
import Avatar from "components/account/avatar";
import type { VoucherCode } from "@cocalc/util/db-schema/vouchers";
import { stringify as csvStringify } from "csv-stringify/sync";
import { currency, human_readable_size } from "@cocalc/util/misc";
import CodeMirror from "components/share/codemirror";
import { trunc } from "lib/share/util";
import useDatabase from "lib/hooks/database";
import Notes from "./notes";
import Help from "components/vouchers/help";
import Copyable from "components/misc/copyable";

function RedeemURL({ code }) {
  const [url, setUrl] = useState<string>("");
  useEffect(() => {
    if (typeof window !== "undefined") {
      setUrl(codeToUrl(code, window.location.href));
    }
  }, []);

  return (
    <Space>
      <A href={url}>
        <Icon name="external-link" />
      </A>{" "}
      <Copyable display={`…${code}`} value={url} />
    </Space>
  );
}

const COLUMNS = [
  {
    title: "Redeem URL (share this)",
    dataIndex: "url",
    key: "redeem",
    render: (_, { code }) => <RedeemURL code={code} />,
  },
  {
    title: "Code",
    dataIndex: "code",
    key: "code",
  },
  {
    title: "Created",
    dataIndex: "created",
    key: "created",
    align: "center",
    render: (_, { created }) => (
      <>{created == null ? "-" : <TimeAgo datetime={created} />}</>
    ),
  },
  {
    title: "When Redeemed",
    dataIndex: "when_redeemed",
    key: "when_redeemed",
    align: "center",
    render: (_, { when_redeemed }) => (
      <>{when_redeemed == null ? "-" : <TimeAgo datetime={when_redeemed} />}</>
    ),
  },
  {
    title: "Redeemed By",
    dataIndex: "redeemed_by",
    key: "redeemed_by",
    align: "center",
    render: (_, { redeemed_by }) => (
      <>{redeemed_by ? <Avatar account_id={redeemed_by} /> : undefined}</>
    ),
  },

  {
    title: "Canceled",
    dataIndex: "canceled",
    key: "canceled",
    align: "center",
    render: (_, { canceled }) => (canceled ? "Yes" : "-"),
  },
  {
    title: "Your Private Notes",
    dataIndex: "notes",
    key: "notes",
    render: (_, { notes, code }) => <Notes notes={notes} code={code} />,
  },
] as any;

type DownloadType = "csv" | "json";

export default function VoucherCodes({ customize, id }) {
  const database = useDatabase({ vouchers: { id, title: null, cost: null } });
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<VoucherCode[] | null>(null);
  const [showModal, setShowModal] = useState<DownloadType | null>(null);

  useEffect(() => {
    setLoading(true);
    (async () => {
      try {
        const { codes } = await apiPost("/vouchers/get-voucher-codes", { id });
        setData(codes);
      } catch (err) {
        setError(`${err}`);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const allCodes = useMemo(() => {
    if (!data) return [];
    return data.map((x) => x.code);
  }, [data]);

  const unusedCodes = useMemo(() => {
    if (!data) return [];
    return data.filter((x) => !x.when_redeemed).map((x) => x.code);
  }, [data]);

  const usedCodes = useMemo(() => {
    if (!data) return [];
    return data.filter((x) => !!x.when_redeemed).map((x) => x.code);
  }, [data]);

  return (
    <Customize value={customize}>
      <Head title={`Voucher With id=${id}`} />
      <DownloadModal
        data={data}
        id={id}
        type={showModal}
        onClose={() => setShowModal(null)}
      />
      <Layout>
        <Header />
        <Layout.Content>
          <div
            style={{
              width: "100%",
              margin: "10vh 0",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Card style={{ background: "#fafafa" }}>
              <Space direction="vertical" align="center">
                <A href="/vouchers">
                  <Icon name="gift2" style={{ fontSize: "75px" }} />
                </A>
                <h1>Voucher: id={id}</h1>
                {database.value?.vouchers?.title && (
                  <h3>Title: {database.value.vouchers.title}</h3>
                )}
                {database.value?.vouchers != null && (
                  <div
                    style={{
                      margin: "auto",
                      padding: "15px",
                      textAlign: "center",
                      fontSize: "14pt",
                    }}
                  >
                    Each Voucher is Worth{" "}
                    {currency(database.value?.vouchers?.cost)} in credit.
                  </div>
                )}
                <Divider />

                {error && (
                  <Alert
                    type="error"
                    message={error}
                    showIcon
                    style={{ width: "100%", marginBottom: "30px" }}
                    closable
                    onClose={() => setError("")}
                  />
                )}
                {loading && <Loading />}
                {!loading && data && (
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        marginBottom: "15px",
                      }}
                    >
                      <Space direction="vertical">
                        <Space>
                          <div style={{ width: "200px" }}>
                            Copy All Codes {`(${allCodes.length})`}
                          </div>
                          <Copyable
                            value={allCodes.join(", ")}
                            inputWidth={"200px"}
                          />
                        </Space>
                        <Space>
                          <div style={{ width: "200px" }}>
                            Copy Unused Codes {`(${unusedCodes.length})`}
                          </div>
                          <Copyable
                            value={unusedCodes.join(", ")}
                            inputWidth={"200px"}
                          />
                        </Space>
                        <Space>
                          <div style={{ width: "200px" }}>
                            Copy Redeemed Codes {`(${usedCodes.length})`}
                          </div>
                          <Copyable
                            value={usedCodes.join(", ")}
                            inputWidth={"200px"}
                          />
                        </Space>
                        <Space>
                          <div style={{ width: "200px" }}>
                            Export all data to CSV
                          </div>
                          <Button onClick={() => setShowModal("csv")}>
                            <Icon name="csv" /> Export to CSV...
                          </Button>
                        </Space>
                        <Space>
                          <div style={{ width: "200px" }}>
                            Export all data to JSON
                          </div>
                          <Button onClick={() => setShowModal("json")}>
                            <Icon name="js-square" /> Export to JSON...
                          </Button>
                        </Space>
                      </Space>
                    </div>

                    <Table
                      columns={COLUMNS}
                      dataSource={data}
                      rowKey="code"
                      pagination={{ defaultPageSize: 50 }}
                    />
                  </div>
                )}
                {!loading && data?.length == 0 && (
                  <div>
                    You have not <A href="/redeem">redeemed any vouchers</A>{" "}
                    yet.
                  </div>
                )}
                <Help />
              </Space>
            </Card>
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const { id } = context.params;
  return await withCustomize({ context, props: { id } });
}

function DownloadModal({ type, data, id, onClose }) {
  const [data0, setData0] = useState<VoucherCode[] | null>(data);
  useEffect(() => {
    if (data == null) return;
    if (typeof window == "undefined") return;
    setData0(
      data.map((x) => {
        return { ...x, url: codeToUrl(x.code, window.location.href) };
      }),
    );
  }, [data]);
  const path = `vouchers-${id}.${type}`;
  const content = useMemo(() => {
    if (!type || data0 == null) return "";
    if (type == "csv") {
      const x = [COLUMNS.map((x) => x.title)].concat(
        data0.map((x) => COLUMNS.map((c) => x[c.dataIndex])),
      );
      return csvStringify(x);
    } else if (type == "json") {
      return JSON.stringify(data0, undefined, 2);
    }
    return "";
  }, [type, data0]);

  const body = useMemo(() => {
    if (!type || !data) {
      return null;
    }
    return (
      <div>
        <div style={{ margin: "30px", fontSize: "13pt", textAlign: "center" }}>
          <a
            href={URL.createObjectURL(
              new Blob([content], { type: "text/plain" }),
            )}
            download={path}
          >
            Download {path} (size: {human_readable_size(content.length)})
          </a>
        </div>
        <CodeMirror
          lineNumbers={false}
          content={trunc(content, 500)}
          filename={path}
        />
      </div>
    );
  }, [type, data, id]);

  return (
    <Modal
      open={type != null}
      onCancel={onClose}
      onOk={onClose}
      title={<>Export all data to {type ? type.toUpperCase() : ""}</>}
    >
      {body}
    </Modal>
  );
}

function codeToUrl(code, href): string {
  let i = href.lastIndexOf("/");
  i = href.lastIndexOf("/", i - 1);
  return `${href.slice(0, i)}/redeem/${code}`;
}
