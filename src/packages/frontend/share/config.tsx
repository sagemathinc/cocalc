/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Configure how a path is shared.

This is used by the frontend client to configure how a path
is shared.

- Public
- Public, but need a predictable link
- Public, but needs a secret random token link
- Authenticated, only someone who is signed in can access
- Private, not shared at all

NOTE: Our approach to state regarding how shared means that two people can't
simultaneously edit this and have it be synced properly
between them.
*/

const SHARE_HELP_URL = "https://doc.cocalc.com/share.html";

import {
  Alert,
  Button,
  Checkbox,
  Col,
  Divider,
  Input,
  Progress,
  Radio,
  Row,
  Space,
  Spin,
  message,
} from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PublishedShare,
  SharePublishResult,
  ShareScope,
} from "@cocalc/conat/hub/api/shares";
import type {
  LroEvent,
  LroSummary,
  LroStatus,
} from "@cocalc/conat/hub/api/lro";
import { CSS, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  A,
  CopyToClipBoard,
  Icon,
  Loading,
  Paragraph,
  Text,
  Title,
  VisibleMDLG,
} from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import {
  SHARE_AUTHENTICATED_EXPLANATION,
  SHARE_AUTHENTICATED_ICON,
  SHARE_FLAGS,
} from "@cocalc/util/consts/ui";
import {
  applyLroEvents,
  isTerminal,
  progressBarStatus,
  type LroOpState,
} from "@cocalc/frontend/lro/utils";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import {
  encode_path,
  human_readable_size,
  trunc_middle,
  unreachable,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import { ConfigureName } from "./configure-name";
import { License } from "./license";
import { publicShareUrl, shareServerUrl } from "./util";
import { containing_public_path } from "@cocalc/util/misc";
import { type PublicPath } from "@cocalc/util/db-schema/public-paths";
import { type ProjectActions } from "@cocalc/frontend/project_store";

// https://ant.design/components/grid/
const GUTTER: [number, number] = [20, 30];

interface Props {
  project_id: string;
  path: string;
  close: (event: any) => void;
  onKeyUp?: (event: any) => void;
  actions: ProjectActions;
  has_network_access?: boolean;
}

// ensures the custom font sizes in the text of the first row is consistent
const FONTSIZE_TOP = "12pt";
const ACCESS_LEVEL_OPTION_STYLE: CSS = { fontSize: FONTSIZE_TOP };

const STATES = {
  private: "Private",
  public_listed: "Public (listed)",
  public_unlisted: "Public (unlisted)",
  authenticated: "Authenticated",
} as const;

type States = keyof typeof STATES;

function SC({ children }) {
  return <Text strong>{children}</Text>;
}

export default function Configure({
  project_id,
  path,
  close,
  onKeyUp,
  actions,
  has_network_access,
}: Props) {
  const publicPaths = useTypedRedux({ project_id }, "public_paths");
  const publicInfo: null | PublicPath = useMemo(() => {
    for (const x of publicPaths?.valueSeq() ?? []) {
      if (
        !x.get("disabled") &&
        containing_public_path(path, [x.get("path")]) != null
      ) {
        return x.toJS();
      }
    }
    return null;
  }, [publicPaths]);

  const student = useStudentProjectFunctionality(project_id);
  const [description, setDescription] = useState<string>(
    publicInfo?.description ?? "",
  );
  const [sharingOptionsState, setSharingOptionsState] = useState<States>(() => {
    if (publicInfo == null) {
      return "private";
    }
    if (publicInfo?.unlisted) {
      return "public_unlisted";
    }
    if (publicInfo?.authenticated) {
      return "authenticated";
    }
    if (!publicInfo?.unlisted) {
      return "public_listed";
    }
    return "private";
  });

  const kucalc = useTypedRedux("customize", "kucalc");
  const shareServer = useTypedRedux("customize", "share_server");

  const handleSharingOptionsChange = (e) => {
    const state: States = e.target.value;
    setSharingOptionsState(state);
    switch (state) {
      case "private":
        actions.set_public_path(path, SHARE_FLAGS.DISABLED);
        break;
      case "public_listed":
        // public is suppose to work in this state
        actions.set_public_path(path, SHARE_FLAGS.LISTED);
        break;
      case "public_unlisted":
        actions.set_public_path(path, SHARE_FLAGS.UNLISTED);
        break;
      case "authenticated":
        actions.set_public_path(path, SHARE_FLAGS.AUTHENTICATED);
        break;
      default:
        unreachable(state);
    }
  };

  const license = publicInfo?.license ?? "";

  // This path is public because some parent folder is public.
  const parentIsPublic = publicInfo != null && publicInfo.path != path;

  const url = publicShareUrl(
    project_id,
    parentIsPublic && publicInfo != null ? publicInfo.path : path,
    path,
  );

  const server = shareServerUrl();

  if (!shareServer) {
    return (
      <Alert
        type="warning"
        style={{ padding: "30px", margin: "30px" }}
        description={
          <>
            <Title level={3}>Publicly sharing of files is not enabled</Title>
            <Paragraph style={{ fontSize: FONTSIZE_TOP }}>
              Public sharing is not enabled. An admin of the server can enable
              this in Admin -- Site Settings -- Allow public file sharing.
            </Paragraph>
          </>
        }
      />
    );
  }

  if (student.disableSharing && sharingOptionsState == "private") {
    // sharing is disabled for this student project, and they didn't
    // already share the file.  If they did, they can still unshare it.
    return (
      <Alert
        type="warning"
        style={{ padding: "30px", margin: "30px" }}
        description={
          <>
            <Title level={3}>
              Publicly sharing of files is not enabled from this student project
            </Title>
            <Paragraph style={{ fontSize: FONTSIZE_TOP }}>
              Public sharing is disabled right now for this project. This was
              set by the course instructor.
            </Paragraph>
          </>
        }
      />
    );
  }

  function renderFinishedButton() {
    return (
      <Button onClick={close} type="primary">
        <Icon name="check" /> Finished
      </Button>
    );
  }

  return (
    <>
      <Title level={3} style={{ color: COLORS.GRAY_M, textAlign: "center" }}>
        <a
          onClick={() => {
            redux.getProjectActions(project_id)?.load_target("files/" + path);
          }}
        >
          {trunc_middle(path, 128)}
        </a>
        <span style={{ float: "right" }}>{renderFinishedButton()}</span>
      </Title>

      <Row gutter={GUTTER}>
        <Col span={12}>
          <VisibleMDLG>
            <Title level={3}>
              <Icon name="user-secret" /> Access level:{" "}
              {STATES[sharingOptionsState]}
            </Title>
          </VisibleMDLG>
        </Col>
        <Col span={12}>
          <VisibleMDLG>
            <Title level={3}>
              <Icon name="gears" /> How it works
            </Title>
          </VisibleMDLG>
        </Col>
      </Row>
      <Row gutter={GUTTER}>
        <Col span={12}>
          {!parentIsPublic && (
            <>
              <Paragraph style={{ fontSize: FONTSIZE_TOP }}>
                <Radio.Group
                  value={sharingOptionsState}
                  onChange={handleSharingOptionsChange}
                >
                  <Space direction="vertical">
                    <Radio
                      name="sharing_options"
                      value="public_listed"
                      disabled={!has_network_access}
                      style={ACCESS_LEVEL_OPTION_STYLE}
                    >
                      <Icon name="eye" style={{ marginRight: "5px" }} />
                      <SC>{STATES.public_listed}</SC> - on the{" "}
                      <A href={shareServerUrl()}>
                        public search engine indexed server.{" "}
                        {!has_network_access && (
                          <b>
                            (This project must be upgraded to have Internet
                            access.)
                          </b>
                        )}
                      </A>
                    </Radio>
                    <Radio
                      name="sharing_options"
                      value="public_unlisted"
                      style={ACCESS_LEVEL_OPTION_STYLE}
                    >
                      <Icon name="eye-slash" style={{ marginRight: "5px" }} />
                      <SC>{STATES.public_unlisted}</SC> - only people with the
                      link can view this.
                    </Radio>

                    {kucalc != KUCALC_COCALC_COM ? (
                      <>
                        <Radio
                          name="sharing_options"
                          value="authenticated"
                          style={ACCESS_LEVEL_OPTION_STYLE}
                        >
                          <Icon
                            name={SHARE_AUTHENTICATED_ICON}
                            style={{ marginRight: "5px" }}
                          />
                          <SC>{STATES.authenticated}</SC> -{" "}
                          {SHARE_AUTHENTICATED_EXPLANATION}.
                        </Radio>
                      </>
                    ) : undefined}

                    <Radio
                      name="sharing_options"
                      value="private"
                      style={ACCESS_LEVEL_OPTION_STYLE}
                    >
                      <Icon name="lock" style={{ marginRight: "5px" }} />
                      <SC>{STATES.private}</SC> - only collaborators on this
                      project can view this.
                    </Radio>
                  </Space>
                </Radio.Group>
              </Paragraph>
            </>
          )}
          {parentIsPublic && publicInfo != null && (
            <Alert
              showIcon
              type="warning"
              style={{ wordWrap: "break-word" }}
              description={
                <>
                  This is public because it is in the public folder "
                  {publicInfo.path}". Adjust the sharing configuration of that
                  folder instead.
                </>
              }
            />
          )}
        </Col>
        <Col span={12}>
          <Paragraph style={{ color: COLORS.GRAY_M, fontSize: FONTSIZE_TOP }}>
            You make files or directories{" "}
            <A href={server}>
              <b>
                <i>public to the world</i>,
              </b>
            </A>{" "}
            either indexed by search engines (listed), or only visible with the
            link (unlisted). Files are automatically copied to the public server
            within <b>about 30 seconds</b> after you explicitly edit them.
            Opening this dialog also causes an immediate update. See{" "}
            <A href={SHARE_HELP_URL}>the docs</A> for more details.
          </Paragraph>
        </Col>
      </Row>
      {sharingOptionsState !== "private" ? (
        <Row gutter={GUTTER}>
          <Col span={12} style={{ color: COLORS.GRAY_M }}>
            <Space direction="vertical">
              <div>
                <Title level={4}>
                  <Icon name="pencil" /> Description
                </Title>
                <Input.TextArea
                  autoFocus
                  style={{ paddingTop: "5px", margin: "15px 0" }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={parentIsPublic}
                  placeholder="Describe what you are sharing.  You can change this at any time."
                  onKeyUp={onKeyUp}
                  onBlur={() => {
                    actions.set_public_path(path, { description });
                  }}
                />
              </div>
              <div>
                <Title level={4}>
                  <Icon name="users" /> Copyright
                  {license ? "" : " - optional"}
                </Title>
                <Paragraph type="secondary">
                  You can choose a license for your shared document. Get help{" "}
                  <A href="https://choosealicense.com/">
                    choosing a suitable license
                  </A>
                  .
                </Paragraph>
                <Paragraph style={{ marginBottom: "5px" }}>
                  <License
                    disabled={parentIsPublic}
                    license={license}
                    set_license={(license) =>
                      actions.set_public_path(path, { license })
                    }
                  />
                </Paragraph>
              </div>
            </Space>
          </Col>
          <Col span={12}>
            {/* width:100% because we want the CopyToClipBoard be wide */}
            <Space direction="vertical" style={{ width: "100%" }}>
              <div style={{ width: "100%" }}>
                <Title level={4}>
                  <Icon name="external-link" /> Location of share
                </Title>
                <Paragraph>
                  This share will be accessible here:{" "}
                  <A href={url} style={{ fontWeight: "bold" }}>
                    Link <Icon name="external-link" />
                  </A>
                </Paragraph>
                <Paragraph style={{ display: "flex" }}>
                  <CopyToClipBoard
                    style={{ flex: 1, display: "flex" }}
                    outerStyle={{ flex: 1 }}
                    value={url}
                    inputWidth={"100%"}
                  />
                </Paragraph>
              </div>
              <ConfigureName
                project_id={project_id}
                path={publicInfo?.path ?? path}
                saveRedirect={(redirect) => {
                  actions.set_public_path(path, { redirect });
                }}
                disabled={parentIsPublic}
              />
            </Space>
          </Col>
        </Row>
      ) : undefined}
      <Paragraph style={{ float: "right" }}>{renderFinishedButton()}</Paragraph>
      <PublishedSharePanel
        project_id={project_id}
        path={path}
        allow_authenticated={kucalc != KUCALC_COCALC_COM}
      />
    </>
  );
}

type ShareLoadState =
  | { status: "loading" }
  | { status: "ready"; share: PublishedShare | null; is_parent: boolean }
  | { status: "error"; error: string };

type ShareScopeOption = ShareScope;

const SHARE_SCOPE_LABELS: Record<ShareScopeOption, string> = {
  public: "Public (listed)",
  unlisted: "Public (unlisted)",
  authenticated: "Authenticated",
  org: "Organization",
};

function PublishedSharePanel({
  project_id,
  path,
  allow_authenticated,
}: {
  project_id: string;
  path: string;
  allow_authenticated: boolean;
}) {
  const shareDomain = useTypedRedux("customize", "share_domain");
  const primaryDomain = useTypedRedux("customize", "dns");
  const [state, setState] = useState<ShareLoadState>({ status: "loading" });
  const [scope, setScope] = useState<ShareScopeOption>("unlisted");
  const [indexingOptIn, setIndexingOptIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishOp, setPublishOp] = useState<SharePublishResult | null>(null);
  const [publishLro, setPublishLro] = useState<LroOpState | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewTokenError, setPreviewTokenError] = useState<string | null>(
    null,
  );
  const [previewTokenLoading, setPreviewTokenLoading] = useState(false);
  const shareDomainBase = useMemo(
    () => normalizeShareDomainUrl(shareDomain),
    [shareDomain],
  );
  const shareDomainConflict = useMemo(
    () => domainsMatch(shareDomain, primaryDomain),
    [shareDomain, primaryDomain],
  );
  const shareDomainError = shareDomainConflict
    ? "Share domain must be different from External Domain Name. Please contact a site admin."
    : shareDomainBase
      ? null
      : "Share domain is not configured. Please contact a site admin.";

  const loadShares = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const shares = await webapp_client.conat_client.hub.shares.listShares({
        project_id,
      });
      const match = findShareMatch(shares, path);
      setState({
        status: "ready",
        share: match.share,
        is_parent: match.is_parent,
      });
      if (match.share) {
        const nextScope = match.share.scope;
        setScope(nextScope);
        setIndexingOptIn(!!match.share.indexing_opt_in);
      }
    } catch (err) {
      setState({
        status: "error",
        error: err instanceof Error ? err.message : `${err}`,
      });
    }
  }, [project_id, path]);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  useEffect(() => {
    setPublishOp(null);
    setPublishLro(null);
    setPublishError(null);
    setPreviewToken(null);
    setPreviewTokenError(null);
    setPreviewTokenLoading(false);
  }, [project_id, path]);

  const share = state.status === "ready" ? state.share : null;
  const isParent = state.status === "ready" ? state.is_parent : false;
  const shareUrl = useMemo(() => {
    if (!share || !shareDomainBase || shareDomainConflict) return "";
    const relative = isParent ? relativeSharePath(share.path, path) : "";
    return buildShareViewerUrl(share, relative, shareDomainBase);
  }, [share, isParent, path, shareDomainBase, shareDomainConflict]);

  const publishStatus = share?.last_publish_status as LroStatus | undefined;
  const publishSummary = publishLro?.summary;
  const publishProgress = publishLro?.last_progress;
  const publishStatusResolved = publishSummary?.status ?? publishStatus;
  const publishInProgress =
    publishStatusResolved != null && !isTerminal(publishStatusResolved);
  const needsPreviewToken =
    share?.scope === "authenticated" || share?.scope === "org";
  const canPreview = share?.last_publish_status === "succeeded";
  const previewBlocked = !!shareDomainError;

  const previewUrl = useMemo(() => {
    if (!shareUrl || !canPreview) return "";
    if (!needsPreviewToken) return shareUrl;
    if (!previewToken) return "";
    const joiner = shareUrl.includes("?") ? "&" : "?";
    return `${shareUrl}${joiner}token=${encodeURIComponent(previewToken)}`;
  }, [shareUrl, canPreview, needsPreviewToken, previewToken]);

  const publishPercent = formatPublishPercent(publishProgress, publishSummary);
  const publishLabel = formatPublishLabel(
    publishProgress,
    publishSummary,
    publishStatusResolved,
  );
  const publishDetail = formatPublishDetail(
    publishProgress?.detail ?? publishSummary?.progress_summary,
  );
  const publishErrorMessage = publishError ?? publishSummary?.error ?? null;
  const publishOpId = publishOp?.op_id;
  const publishOpScopeId = publishOp?.scope_id;
  const publishOpScopeType = publishOp?.scope_type;
  const publishOpStreamName = publishOp?.stream_name;

  const canEdit =
    !busy && !isParent && share?.scope !== "org" && !publishInProgress;
  const scopeOptions = useMemo(() => {
    const options: ShareScopeOption[] = allow_authenticated
      ? ["public", "unlisted", "authenticated"]
      : ["public", "unlisted"];
    if (share?.scope === "org") {
      options.push("org");
    }
    return options;
  }, [allow_authenticated, share?.scope]);

  useEffect(() => {
    if (!publishOpId || !publishOpScopeType || !publishOpScopeId) {
      setPublishLro(null);
      return;
    }
    const opId = publishOpId;
    const scopeType = publishOpScopeType;
    const scopeId = publishOpScopeId;
    const streamName = publishOpStreamName;
    let active = true;
    let stream: Awaited<
      ReturnType<typeof webapp_client.conat_client.lroStream>
    > | null = null;

    const connect = async () => {
      setPublishError(null);
      try {
        stream = await webapp_client.conat_client.lroStream({
          op_id: opId,
          stream_name: streamName,
          scope_type: scopeType,
          scope_id: scopeId,
        });
      } catch (err) {
        if (active) {
          setPublishError(err instanceof Error ? err.message : `${err}`);
        }
        return;
      }
      if (!active || !stream) {
        stream?.close();
        return;
      }
      const update = () => {
        if (!active || !stream) return;
        let events: LroEvent[];
        try {
          events = stream.getAll();
        } catch (err) {
          setPublishError(err instanceof Error ? err.message : `${err}`);
          return;
        }
        let terminal: LroSummary | undefined;
        setPublishLro((prev) => {
          const next = applyLroEvents({
            events,
            summary: prev?.summary,
            last_progress: prev?.last_progress,
            last_event: prev?.last_event,
          });
          terminal = next.summary;
          return { op_id: opId, ...next };
        });
        if (terminal && isTerminal(terminal.status)) {
          stream.removeListener("change", update);
          stream.close();
        }
      };
      update();
      stream.on("change", update);
    };

    void connect();

    return () => {
      active = false;
      if (stream) {
        stream.close();
      }
    };
  }, [publishOpId, publishOpScopeId, publishOpScopeType, publishOpStreamName]);

  useEffect(() => {
    if (!publishLro?.summary) return;
    if (!isTerminal(publishLro.summary.status)) return;
    void loadShares();
  }, [publishLro?.summary?.status, loadShares]);

  useEffect(() => {
    if (
      !share?.share_id ||
      !canPreview ||
      previewBlocked ||
      !needsPreviewToken
    ) {
      setPreviewToken(null);
      setPreviewTokenError(null);
      setPreviewTokenLoading(false);
      return;
    }
    let active = true;
    setPreviewTokenLoading(true);
    setPreviewToken(null);
    setPreviewTokenError(null);
    void (async () => {
      try {
        const token = await webapp_client.conat_client.hub.shares.viewerToken({
          share_id: share.share_id,
        });
        if (!active) return;
        setPreviewToken(token?.token ?? null);
      } catch (err) {
        if (!active) return;
        setPreviewTokenError(err instanceof Error ? err.message : `${err}`);
      } finally {
        if (active) {
          setPreviewTokenLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [share?.share_id, canPreview, previewBlocked, needsPreviewToken]);

  const handleCreate = async () => {
    setBusy(true);
    try {
      const created = await webapp_client.conat_client.hub.shares.createShare({
        project_id,
        path,
        scope,
        indexing_opt_in: indexingOptIn,
      });
      setState({ status: "ready", share: created, is_parent: false });
      message.success("Published share created.");
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "Failed to create share.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!share) return;
    setBusy(true);
    try {
      const result = await webapp_client.conat_client.hub.shares.publishShare({
        share_id: share.share_id,
      });
      setPublishOp(result);
      setPublishLro(null);
      setPublishError(null);
      message.success("Publish queued.");
      void loadShares();
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "Failed to publish share.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleScopeChange = async (next: ShareScopeOption) => {
    setScope(next);
    if (!share) return;
    setBusy(true);
    try {
      const updated = await webapp_client.conat_client.hub.shares.updateShare({
        share_id: share.share_id,
        scope: next,
      });
      setState({ status: "ready", share: updated, is_parent: false });
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "Failed to update share scope.",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleIndexingChange = async (next: boolean) => {
    setIndexingOptIn(next);
    if (!share) return;
    setBusy(true);
    try {
      const updated = await webapp_client.conat_client.hub.shares.setIndexing({
        share_id: share.share_id,
        indexing_opt_in: next,
      });
      setState({ status: "ready", share: updated, is_parent: false });
    } catch (err) {
      message.error(
        err instanceof Error ? err.message : "Failed to update indexing.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Divider />
      <Title level={4}>
        <Icon name="share-square" /> Published share (new)
      </Title>
      {state.status === "loading" ? (
        <Loading />
      ) : state.status === "error" ? (
        <Alert type="error" description={state.error} />
      ) : isParent && share ? (
        <Alert
          type="warning"
          showIcon
          description={
            <>
              This path is inside the published share at{" "}
              <Text strong>{share.path}</Text>. Manage publishing from that
              folder instead.
            </>
          }
        />
      ) : (
        <Space direction="vertical" style={{ width: "100%" }}>
          <Paragraph style={{ color: COLORS.GRAY_M }}>
            Published shares are explicit snapshots served from regional
            buckets. Publish to generate a share link and viewer preview.
          </Paragraph>
          {shareDomainError ? (
            <Alert
              type="warning"
              showIcon
              description={shareDomainError}
            />
          ) : null}
          <div>
            <Text strong>Scope</Text>
            <div>
              <Radio.Group
                value={scope}
                onChange={(e) => handleScopeChange(e.target.value)}
                disabled={!canEdit}
              >
                <Space direction="vertical">
                  {scopeOptions.map((option) => (
                    <Radio key={option} value={option}>
                      {SHARE_SCOPE_LABELS[option]}
                    </Radio>
                  ))}
                </Space>
              </Radio.Group>
            </div>
          </div>
          <Checkbox
            checked={indexingOptIn}
            disabled={!canEdit || scope !== "public"}
            onChange={(e) => handleIndexingChange(e.target.checked)}
          >
            Allow search indexing (opt-in)
          </Checkbox>
          {share ? (
            <>
              <Paragraph>
                Share region:{" "}
                <Text strong>{share.share_region ?? "pending"}</Text>
              </Paragraph>
              <Paragraph>
                Latest publish status:{" "}
                <Text strong>{share.last_publish_status ?? "unknown"}</Text>
              </Paragraph>
              {share.last_publish_error ? (
                <Alert type="error" description={share.last_publish_error} />
              ) : null}
              {shareUrl ? (
                <>
                  <Paragraph>
                    Share link:{" "}
                    <A href={shareUrl} style={{ fontWeight: "bold" }}>
                      Link <Icon name="external-link" />
                    </A>
                  </Paragraph>
                  <CopyToClipBoard
                    style={{ flex: 1, display: "flex" }}
                    outerStyle={{ flex: 1 }}
                    value={shareUrl}
                    inputWidth={"100%"}
                  />
                </>
              ) : null}
              <Button
                onClick={handlePublish}
                type="primary"
                disabled={busy || publishInProgress}
              >
                <Icon name="cloud-upload" /> Publish
              </Button>
              {(publishLro ||
                publishInProgress ||
                publishErrorMessage != null) && (
                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: "4px",
                    padding: "8px 10px",
                  }}
                >
                  <Text strong>Publish progress</Text>
                  {publishErrorMessage ? (
                    <Alert
                      type="error"
                      showIcon
                      style={{ marginTop: "6px" }}
                      description={publishErrorMessage}
                    />
                  ) : null}
                  {publishLro ? (
                    <Space
                      align="center"
                      size="small"
                      style={{ marginTop: "6px" }}
                    >
                      {publishPercent == null ? (
                        <Spin size="small" />
                      ) : (
                        <Progress
                          percent={publishPercent}
                          status={progressBarStatus(publishStatusResolved)}
                          size="small"
                          style={{ width: "200px" }}
                        />
                      )}
                      <span style={{ fontSize: "12px", color: COLORS.GRAY_M }}>
                        {publishLabel}
                        {publishDetail ? ` • ${publishDetail}` : ""}
                      </span>
                    </Space>
                  ) : publishInProgress ? (
                    <Paragraph style={{ margin: "6px 0 0" }} type="secondary">
                      Publish is {publishStatusResolved}. Progress will appear
                      after starting a publish from this session.
                    </Paragraph>
                  ) : null}
                </div>
              )}
              <div>
                <Text strong>Preview</Text>
                {previewBlocked ? (
                  <Paragraph style={{ margin: "6px 0 0" }} type="secondary">
                    Configure a share domain to enable the preview.
                  </Paragraph>
                ) : !canPreview ? (
                  <Paragraph style={{ margin: "6px 0 0" }} type="secondary">
                    Publish a snapshot to enable the preview.
                  </Paragraph>
                ) : previewTokenError ? (
                  <Alert
                    type="error"
                    showIcon
                    style={{ marginTop: "6px" }}
                    description={previewTokenError}
                  />
                ) : previewTokenLoading && needsPreviewToken ? (
                  <div style={{ marginTop: "6px" }}>
                    <Spin size="small" />
                  </div>
                ) : previewUrl ? (
                  <div
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "6px",
                      overflow: "hidden",
                      marginTop: "8px",
                    }}
                  >
                    <iframe
                      title="Published share preview"
                      src={previewUrl}
                      style={{ width: "100%", height: "420px", border: "0" }}
                      loading="lazy"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </div>
                ) : (
                  <Paragraph style={{ margin: "6px 0 0" }} type="secondary">
                    Preview is waiting for an access token.
                  </Paragraph>
                )}
              </div>
            </>
          ) : (
            <Button onClick={handleCreate} type="primary" disabled={busy}>
              <Icon name="plus-circle" /> Create published share
            </Button>
          )}
        </Space>
      )}
    </>
  );
}

function findShareMatch(
  shares: PublishedShare[],
  path: string,
): { share: PublishedShare | null; is_parent: boolean } {
  let match: PublishedShare | null = null;
  for (const share of shares) {
    if (share.path === path || isShareParentPath(share.path, path)) {
      if (!match || share.path.length > match.path.length) {
        match = share;
      }
    }
  }
  return {
    share: match,
    is_parent: match ? match.path !== path : false,
  };
}

function isShareParentPath(parent: string, child: string): boolean {
  if (!parent) return child.length > 0;
  return child.startsWith(`${parent}/`);
}

function relativeSharePath(parent: string, child: string): string {
  if (!parent) return child;
  if (child === parent) return "";
  if (child.startsWith(`${parent}/`)) {
    return child.slice(parent.length + 1);
  }
  return "";
}

function buildShareViewerUrl(
  share: PublishedShare,
  relativePath: string,
  shareOrigin: string,
): string {
  const origin = shareOrigin.replace(/\/+$/, "");
  const region = share.share_region?.trim();
  const regionPrefix = region ? `/r/${encodeURIComponent(region)}` : "";
  const base = `${origin}${regionPrefix}/share/${encodeURIComponent(
    share.share_id,
  )}`;
  if (!relativePath) return base;
  return `${base}/${encode_path(relativePath)}`;
}

function formatPublishPercent(
  progress?: Extract<LroEvent, { type: "progress" }>,
  summary?: LroSummary,
): number | undefined {
  const raw = progress?.progress;
  if (raw == null) {
    if (summary?.status && isTerminal(summary.status)) return 100;
    return undefined;
  }
  if (!Number.isFinite(raw)) return undefined;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function formatPublishLabel(
  progress?: Extract<LroEvent, { type: "progress" }>,
  summary?: LroSummary,
  status?: LroStatus,
): string {
  return (
    progress?.message ??
    progress?.phase ??
    summary?.progress_summary?.phase ??
    status ??
    "running"
  );
}

function formatPublishDetail(detail?: Record<string, any>): string | undefined {
  if (!detail) return undefined;
  const parts: string[] = [];
  const processed = detail.processed ?? detail.done;
  const total = detail.total;
  if (processed != null && total != null) {
    parts.push(`${processed}/${total} files`);
  } else if (processed != null) {
    parts.push(`${processed} files`);
  } else if (total != null) {
    parts.push(`${total} files`);
  }
  if (detail.file_count != null && processed == null && total == null) {
    parts.push(`${detail.file_count} files`);
  }
  if (detail.uploaded_bytes != null) {
    parts.push(`${human_readable_size(detail.uploaded_bytes, true)} uploaded`);
  }
  if (detail.size_bytes != null) {
    parts.push(`${human_readable_size(detail.size_bytes, true)} total`);
  }
  if (detail.manifest_id) {
    parts.push(`manifest ${String(detail.manifest_id).slice(0, 8)}`);
  }
  return parts.length ? parts.join(", ") : undefined;
}

function normalizeShareDomainUrl(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    const normalized = url.toString().replace(/\/+$/, "");
    return normalized;
  } catch {
    return undefined;
  }
}

function normalizeDomainForCompare(raw?: string): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  const candidate = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    const host = url.hostname.toLowerCase();
    const port = url.port ? `:${url.port}` : "";
    return `${host}${port}`;
  } catch {
    return undefined;
  }
}

function domainsMatch(a?: string, b?: string): boolean {
  const normA = normalizeDomainForCompare(a);
  const normB = normalizeDomainForCompare(b);
  return !!normA && !!normB && normA === normB;
}
