/*
 *  This file is part of CoCalc: Copyright © 2020-2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Input box for setting the account creation token.
*/

import {
  Button as AntdButton,
  Descriptions,
  Popconfirm,
  Progress,
  Space,
  Switch,
  Table,
} from "antd";
import type { DescriptionsProps } from "antd";
import dayjs from "dayjs";
import { List } from "immutable";
import { sortBy } from "lodash";

import { CopyOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import { Alert } from "@cocalc/frontend/antd-bootstrap";
import { redux, Rendered, TypedMap } from "@cocalc/frontend/app-framework";
import {
  ErrorDisplay,
  Icon,
  Saving,
  TimeAgo,
  Tip,
} from "@cocalc/frontend/components";
import Copyable from "@cocalc/frontend/components/copy-to-clipboard";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  cmp_dayjs,
  round1,
  seconds2hms,
  trunc,
  trunc_middle,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { PassportStrategyFrontend } from "@cocalc/util/types/passport-types";

import RegistrationTokenDialog from "./registration-token-dialog";
import {
  formatEphemeralHours,
  useRegistrationTokens,
} from "./registration-token-hook";
import LicenseSummary from "./registration-token-license-summary";
import { type Token } from "./types";

export function RegistrationToken() {
  // TODO I'm sure this could be done in a smarter way ...
  const {
    data,
    form,
    error,
    setError,
    deleting,
    deleteToken,
    deleteTokens,
    saving,
    selRows,
    setSelRows,
    lastSaved,
    newRandomToken,
    noOrAllInactive,
    save,
    load,
    loading,
    // Modal-related
    modalVisible,
    editingToken,
    modalError,
    licenseInputKey,
    handleModalOpen,
    handleModalCancel,
    handleModalReset,
    handleModalSave,
  } = useRegistrationTokens();

  function render_buttons() {
    const any_selected = selRows.length > 0;
    return (
      <Space.Compact style={{ margin: "10px 0" }}>
        <AntdButton
          type={!any_selected ? "primary" : "default"}
          disabled={any_selected}
          onClick={() => handleModalOpen()}
        >
          <Icon name="plus" />
          Add
        </AntdButton>

        <AntdButton
          type={any_selected ? "primary" : "default"}
          onClick={deleteTokens}
          disabled={!any_selected}
          loading={deleting}
        >
          <Icon name="trash" />
          {any_selected ? `Delete ${selRows.length} token(s)` : "Delete"}
        </AntdButton>

        <AntdButton onClick={() => load()}>
          <Icon name="refresh" />
          Refresh
        </AntdButton>
      </Space.Compact>
    );
  }

  function ephemeralSignupUrl(token: Token): string {
    if (!token || token.ephemeral == null) return "";
    if (typeof window === "undefined") {
      return `/ephemeral?token=${token.token}`;
    }
    const { protocol, host } = window.location;
    return `${protocol}//${host}/ephemeral?token=${token.token}`;
  }

  function render_expanded_row(token: Token): Rendered {
    const uses = token.counter ?? 0;
    const limit = token.limit;
    const pct =
      limit == null
        ? undefined
        : limit === 0
          ? 100
          : round1((100 * uses) / limit);
    const usageLabel =
      pct == null
        ? `${uses}/${limit ?? "∞"} (–%)`
        : `${uses}/${limit} (${pct}%)`;
    const lifetime =
      token.ephemeral != null
        ? seconds2hms(token.ephemeral / 1000, true)
        : "No";
    const ephemeralLink = ephemeralSignupUrl(token);

    const items: DescriptionsProps["items"] = [
      {
        key: "descr",
        label: "Description",
        children: token.descr || "(no description)",
        span: 2,
      },
      {
        key: "usage",
        label: "Usage",
        children: usageLabel,
      },
      {
        key: "ephemeral",
        label: "Ephemeral link",
        span: 2,
        children: ephemeralLink ? (
          <Copyable value={ephemeralLink} size={"small"} />
        ) : (
          "Not available"
        ),
      },
      {
        key: "lifetime",
        label: "Lifetime",
        children: lifetime,
      },
      {
        key: "disableCollaborators",
        label: "Restrict collaborators",
        children: token.customize?.disableCollaborators ? "Yes" : "No",
      },
      {
        key: "disableAI",
        label: "Disable AI",
        children: token.customize?.disableAI ? "Yes" : "No",
      },
      {
        key: "disableInternet",
        label: "Disable internet",
        children: token.customize?.disableInternet ? "Yes" : "No",
      },
      {
        key: "license",
        label: "License",
        span: 3,
        children: <LicenseSummary licenseId={token.customize?.license} />,
      },
    ];

    return <Descriptions items={items} column={3} size="small" />;
  }

  function render_view(): Rendered {
    const table_data = sortBy(
      Object.values(data).map((v) => ({ ...v, key: v.token })),
      "token",
    );
    const rowSelection = {
      selectedRowKeys: selRows,
      onChange: setSelRows,
    };
    return (
      <>
        {render_buttons()}

        <Table<Token>
          size={"small"}
          dataSource={table_data}
          loading={loading}
          rowSelection={rowSelection}
          pagination={{
            position: ["bottomRight"],
            defaultPageSize: 10,
            showSizeChanger: true,
          }}
          rowClassName={(row) =>
            row.token === lastSaved?.token ? "cocalc-highlight-saved-token" : ""
          }
          expandable={{
            expandedRowRender: (record) => render_expanded_row(record),
          }}
        >
          <Table.Column<Token>
            title="Token"
            dataIndex="token"
            defaultSortOrder={"ascend"}
            sorter={(a, b) => a.token.localeCompare(b.token)}
            render={(token: string) => {
              return (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span title={token}>{trunc_middle(token, 7)}</span>
                  <Tip title={`Click to copy token`}>
                    <AntdButton
                      type="text"
                      size="small"
                      icon={<CopyOutlined />}
                      onClick={() => {
                        navigator.clipboard.writeText(token);
                      }}
                    />
                  </Tip>
                </div>
              );
            }}
          />
          <Table.Column<Token>
            title="Description"
            dataIndex="descr"
            render={(text) =>
              text ? <span title={text}>{trunc(text, 30)}</span> : ""
            }
            sorter={(a, b) => {
              const aDescr = a.descr || "";
              const bDescr = b.descr || "";
              return aDescr.localeCompare(bDescr);
            }}
          />
          <Table.Column<Token>
            title="Ephemeral"
            dataIndex="ephemeral"
            render={(value, token) => {
              if (value == null) return "-";
              const url = ephemeralSignupUrl(token);
              return (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <span>{formatEphemeralHours(value)}</span>
                  {url && (
                    <AntdButton
                      type="text"
                      size="small"
                      icon={<Icon name="link" />}
                      onClick={() => {
                        navigator.clipboard.writeText(url);
                      }}
                      title={`${url} - Click to copy`}
                    />
                  )}
                </div>
              );
            }}
          />
          <Table.Column<Token>
            title="% Used"
            dataIndex="used"
            render={(_text, token) => {
              const { limit, counter } = token;
              if (limit == null) return "";

              const c = counter ?? 0;
              const pct = limit === 0 ? 100 : (100 * c) / limit;
              const status =
                pct > 90 ? "exception" : pct > 75 ? "normal" : "success";

              const tooltipContent = (
                <div>
                  <div>
                    <strong>Uses:</strong> {c}
                  </div>
                  <div>
                    <strong>Limit:</strong> {limit}
                  </div>
                  <div>
                    <strong>Percentage:</strong> {round1(pct)}%
                  </div>
                </div>
              );

              return (
                <Tip title={tooltipContent}>
                  <Progress
                    percent={round1(pct)}
                    size="small"
                    status={status}
                    strokeColor={pct > 90 ? COLORS.ANTD_RED : undefined}
                  />
                </Tip>
              );
            }}
          />
          <Table.Column<Token>
            title="Expires"
            dataIndex="expires"
            sortDirections={["ascend", "descend"]}
            render={(v) => {
              const now = dayjs(webapp_client.server_time());
              const expired = v != null && cmp_dayjs(v, now) < 0;
              return {
                props: {
                  style: {
                    background: expired ? COLORS.ANTD_BG_RED_L : undefined,
                    padding: "0 4px",
                  },
                },
                children: v != null ? <TimeAgo date={v} /> : "never",
              };
            }}
            sorter={(a, b) => cmp_dayjs(a.expires, b.expires, true)}
          />

          <Table.Column<Token>
            title="Active"
            dataIndex="disabled"
            render={(_text, token) => {
              const onChange = async (checked: boolean) => {
                try {
                  await save({ ...token, active: checked });
                } catch (err) {
                  // Error already set by save(), just prevent unhandled rejection
                }
              };
              return <Switch checked={token.active} onChange={onChange} />;
            }}
            sorter={(a, b) => {
              const aActive = a.active ? 1 : 0;
              const bActive = b.active ? 1 : 0;
              return aActive - bActive;
            }}
          />
          <Table.Column<Token>
            title="Edit"
            dataIndex="edit"
            render={(_text, token) => (
              <EditOutlined onClick={() => handleModalOpen(token)} />
            )}
          />
          <Table.Column<Token>
            title="Delete"
            dataIndex="delete"
            render={(_text, token) => (
              <Popconfirm
                title="Sure to delete?"
                onConfirm={() => deleteToken(token.key, true)}
              >
                <DeleteOutlined />
              </Popconfirm>
            )}
          />
        </Table>
      </>
    );
  }

  function render_error(): Rendered {
    if (error) {
      return <ErrorDisplay error={error} onClose={() => setError("")} />;
    }
  }

  // this tells an admin that users can sign in freely if there are no tokens or no active tokens
  function render_no_active_token_warning(): Rendered {
    if (noOrAllInactive) {
      return (
        <Alert bsStyle="warning">
          No tokens, or there are no active tokens. This means anybody can use
          your server.
          <br />
          Create at least one active token to prevent just anybody from signing
          up for your server!
        </Alert>
      );
    }
  }

  function render_unsupported() {
    // see https://github.com/sagemathinc/cocalc/issues/333
    return (
      <div style={{ color: COLORS.GRAY }}>
        Not supported! At least one "public" passport strategy is enabled.
      </div>
    );
  }

  function render_info(): Rendered {
    return (
      <div style={{ color: COLORS.GRAY, fontStyle: "italic" }}>
        {saving && (
          <>
            <Saving />
            <br />
          </>
        )}
        Note: You can disable email sign up in Site Settings
      </div>
    );
  }

  // disable token editing if any strategy besides email is public
  function not_supported(strategies): boolean {
    return strategies
      .filterNot((s) => s.get("name") === "email")
      .some((s) => s.get("public"));
  }

  function render_dialog() {
    return (
      <RegistrationTokenDialog
        open={modalVisible}
        isEdit={editingToken != null}
        editingToken={editingToken}
        onCancel={handleModalCancel}
        onSave={handleModalSave}
        onReset={handleModalReset}
        error={modalError}
        form={form}
        newRandomToken={newRandomToken}
        saving={saving}
        licenseInputKey={licenseInputKey}
      />
    );
  }

  const account_store: any = redux.getStore("account");
  if (account_store == null) {
    return <div>Account store not defined -- try again...</div>;
  }
  const strategies: List<TypedMap<PassportStrategyFrontend>> | undefined =
    account_store.get("strategies");
  if (strategies == null) {
    // I hit this in production once and it crashed my browser.
    return <div>strategies not loaded -- try again...</div>;
  }
  if (not_supported(strategies)) {
    return render_unsupported();
  } else {
    return (
      <div>
        {render_no_active_token_warning()}
        {render_error()}
        {render_view()}
        {render_dialog()}
        {render_info()}
      </div>
    );
  }
}
