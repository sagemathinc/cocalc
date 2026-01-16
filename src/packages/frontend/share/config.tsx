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
  Col,
  Input,
  Radio,
  Row,
  Space,
} from "antd";
import { useMemo, useState } from "react";
import { CSS, redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  A,
  CopyToClipBoard,
  Icon,
  Paragraph,
  Text,
  Title,
  VisibleMDLG,
} from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import {
  SHARE_AUTHENTICATED_EXPLANATION,
  SHARE_AUTHENTICATED_ICON,
  SHARE_FLAGS,
} from "@cocalc/util/consts/ui";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import { trunc_middle, unreachable } from "@cocalc/util/misc";
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
  compute_server_id?: number;
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
  compute_server_id,
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

  if (compute_server_id) {
    return (
      <Alert
        type="warning"
        style={{ padding: "30px", margin: "30px" }}
        description={
          <>
            <h3>Publicly sharing files on a compute server is not supported</h3>
            <div style={{ fontSize: "12pt" }}>
              Copy the files to the project, then share them.
            </div>
          </>
        }
      />
    );
  }

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
    </>
  );
}
