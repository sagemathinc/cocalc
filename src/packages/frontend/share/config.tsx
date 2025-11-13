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
  Input,
  Popconfirm,
  Radio,
  Row,
  Space,
} from "antd";
import { useEffect, useState } from "react";

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
import { useManagedLicenses } from "@cocalc/frontend/site-licenses/input";
import SelectLicense from "@cocalc/frontend/site-licenses/select-license";
import { SiteLicensePublicInfo } from "@cocalc/frontend/site-licenses/site-license-public-info-component";
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

// https://ant.design/components/grid/
const GUTTER: [number, number] = [20, 30];

interface PublicInfo {
  created: Date;
  description: string;
  disabled: boolean;
  last_edited: Date;
  path: string;
  unlisted: boolean;
  authenticated?: boolean;
  license?: string;
  name?: string;
  site_license_id?: string;
  redirect?: string;
  jupyter_api?: boolean;
}

interface Props {
  project_id: string;
  path: string;
  size: number;
  mtime: number;
  isdir?: boolean;
  is_public?: boolean;
  public?: PublicInfo;
  close: (event: any) => void;
  action_key: (event: any) => void;
  site_license_id?: string;
  set_public_path: (options: {
    description?: string;
    unlisted?: boolean;
    license?: string;
    disabled?: boolean;
    authenticated?: boolean;
    site_license_id?: string | null;
    redirect?: string;
    jupyter_api?: boolean;
  }) => void;
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

export default function Configure(props: Props) {
  const student = useStudentProjectFunctionality(props.project_id);
  const [description, setDescription] = useState<string>(
    props.public?.description ?? "",
  );
  const [sharingOptionsState, setSharingOptionsState] = useState<States>(() => {
    if (props.is_public && props.public?.unlisted) {
      return "public_unlisted";
    }
    if (props.is_public && props.public?.authenticated) {
      return "authenticated";
    }
    if (props.is_public && !props.public?.unlisted) {
      return "public_listed";
    }
    return "private";
  });

  const [licenseId, setLicenseId] = useState<string | null | undefined>(
    props.public?.site_license_id,
  );
  const kucalc = useTypedRedux("customize", "kucalc");
  const shareServer = useTypedRedux("customize", "share_server");

  if (props.compute_server_id) {
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
        props.set_public_path(SHARE_FLAGS.DISABLED);
        break;
      case "public_listed":
        // props.public is suppose to work in this state
        props.set_public_path(SHARE_FLAGS.LISTED);
        break;
      case "public_unlisted":
        props.set_public_path(SHARE_FLAGS.UNLISTED);
        break;
      case "authenticated":
        props.set_public_path(SHARE_FLAGS.AUTHENTICATED);
        break;
      default:
        unreachable(state);
    }
  };

  const license = props.public?.license ?? "";

  // This path is public because some parent folder is public.
  const parent_is_public =
    !!props.is_public &&
    props.public != null &&
    props.public.path != props.path;

  const url = publicShareUrl(
    props.project_id,
    parent_is_public && props.public != null ? props.public.path : props.path,
    props.path,
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
      <Button onClick={props.close} type="primary">
        <Icon name="check" /> Finished
      </Button>
    );
  }

  return (
    <>
      <Title level={3} style={{ color: COLORS.GRAY_M, textAlign: "center" }}>
        <a
          onClick={() => {
            redux
              .getProjectActions(props.project_id)
              ?.load_target("files/" + props.path);
          }}
        >
          {trunc_middle(props.path, 128)}
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
          {!parent_is_public && (
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
                      disabled={!props.has_network_access}
                      style={ACCESS_LEVEL_OPTION_STYLE}
                    >
                      <Icon name="eye" style={{ marginRight: "5px" }} />
                      <SC>{STATES.public_listed}</SC> - on the{" "}
                      <A href={shareServerUrl()}>
                        public search engine indexed server.{" "}
                        {!props.has_network_access && (
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
          {parent_is_public && props.public != null && (
            <Alert
              showIcon
              type="warning"
              style={{ wordWrap: "break-word" }}
              description={
                <>
                  This {props.isdir ? "directory" : "file"} is public because it
                  is in the public folder "{props.public.path}". Adjust the
                  sharing configuration of that folder instead.
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
                  disabled={parent_is_public}
                  placeholder="Describe what you are sharing.  You can change this at any time."
                  onKeyUp={props.action_key}
                  onBlur={() => {
                    props.set_public_path({ description });
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
                    disabled={parent_is_public}
                    license={license}
                    set_license={(license) =>
                      props.set_public_path({ license })
                    }
                  />
                </Paragraph>

                <Title level={4}>
                  <Icon name="key" /> License Code - optional
                </Title>
                <Paragraph>
                  <EnterLicenseCode
                    licenseId={licenseId}
                    setLicenseId={(licenseId) => {
                      setLicenseId(licenseId);
                      props.set_public_path({ site_license_id: licenseId });
                    }}
                  />
                  <Paragraph type="secondary">
                    When people edit a copy of your shared document in a new
                    project, their project will get upgraded using{" "}
                    <b>
                      <i>your</i>
                    </b>{" "}
                    license. You can thus provide a high quality experience to
                    the people you share this link with.
                  </Paragraph>
                </Paragraph>
              </div>
              <ConfigureJupyterApi
                disabled={parent_is_public}
                jupyter_api={props.public?.jupyter_api}
                saveJupyterApi={(jupyter_api) => {
                  props.set_public_path({ jupyter_api });
                }}
              />
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
                project_id={props.project_id}
                path={props.public?.path ?? props.path}
                saveRedirect={(redirect) => {
                  props.set_public_path({ redirect });
                }}
                disabled={parent_is_public}
              />
            </Space>
          </Col>
        </Row>
      ) : undefined}
      <Paragraph style={{ float: "right" }}>{renderFinishedButton()}</Paragraph>
    </>
  );
}

function ConfigureJupyterApi({ jupyter_api, saveJupyterApi, disabled }) {
  const [jupyterApi, setJupyterApi] = useState<boolean>(jupyter_api);
  useEffect(() => {
    setJupyterApi(jupyter_api);
  }, [jupyter_api]);
  const jupyterApiEnabled = useTypedRedux("customize", "jupyter_api_enabled");
  if (!jupyterApiEnabled) return null;
  return (
    <Paragraph style={{ marginTop: "15px" }}>
      <Title level={4}>
        <Icon name="jupyter" /> Stateless Jupyter Code Evaluation
      </Title>
      <Checkbox
        disabled={disabled}
        checked={jupyterApi}
        onChange={(e) => {
          setJupyterApi(e.target.checked);
          saveJupyterApi(e.target.checked);
        }}
      >
        Enable Stateless Jupyter Code Evaluation
      </Checkbox>
      <Paragraph type="secondary">
        Enable stateless Jupyter code evaluation if the documents you are
        sharing containing code that can be evaluated using a heavily sandboxed
        Jupyter kernel, with no network access or access to related files. This
        can be quickly used by people without having to sign in or make a copy
        of files.
      </Paragraph>
    </Paragraph>
  );
}

function EnterLicenseCode({ licenseId, setLicenseId }) {
  const managed = useManagedLicenses();
  const [adding, setAdding] = useState<boolean>(false);
  if (!adding) {
    if (licenseId) {
      return (
        <Paragraph>
          <Button.Group>
            <Button
              onClick={() => setAdding(true)}
              style={{ marginBottom: "5px" }}
            >
              Change License...
            </Button>
            <Popconfirm
              title="Are you sure you want to remove the license?"
              onConfirm={() => setLicenseId(null)}
              okText="Yes"
              cancelText="No"
            >
              <Button style={{ marginBottom: "5px" }}>Remove License</Button>
            </Popconfirm>
          </Button.Group>
          <SiteLicensePublicInfo license_id={licenseId} />
        </Paragraph>
      );
    }
    return (
      <Button onClick={() => setAdding(true)}>Enter License Code...</Button>
    );
  }
  return (
    <SelectLicense
      onSave={(licenseId) => {
        setLicenseId(licenseId);
        setAdding(false);
      }}
      onCancel={() => {
        setAdding(false);
      }}
      onChange={setLicenseId}
      managedLicenses={managed?.toJS() as any}
      confirmLabel={"Use this license"}
    />
  );
}
