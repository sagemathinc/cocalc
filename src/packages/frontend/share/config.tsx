/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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

import { useState } from "react";
import { Alert, Button, Row, Col, Input, Radio, Space } from "antd";
import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  CopyToClipBoard,
  Icon,
  VisibleMDLG,
  A,
} from "@cocalc/frontend/components";
import { publicShareUrl, shareServerUrl } from "./util";
import { License } from "./license";
import { trunc_middle } from "@cocalc/util/misc";
import ConfigureName from "./configure-name";
import { unreachable } from "@cocalc/util/misc";
import { KUCALC_COCALC_COM } from "@cocalc/util/db-schema/site-defaults";
import {
  SHARE_AUTHENTICATED_ICON,
  SHARE_AUTHENTICATED_EXPLANATION,
  SHARE_FLAGS,
} from "@cocalc/util/consts/ui";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";

// https://ant.design/components/grid/
const GUTTER: [number, number] = [16, 24];

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
  set_public_path: (options: {
    description?: string;
    unlisted?: boolean;
    license?: string;
    disabled?: boolean;
    authenticated?: boolean;
  }) => void;
  has_network_access?: boolean;
}

type States = "private" | "public_listed" | "public_unlisted" | "authenticated";

export default function Configure(props: Props) {
  const student = useStudentProjectFunctionality(props.project_id);
  const [description, setDescription] = useState<string>(
    props.public?.description ?? ""
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

  const kucalc = useTypedRedux("customize", "kucalc");
  const shareServer = useTypedRedux("customize", "share_server");

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
    props.path
  );

  const server = shareServerUrl();

  if (!shareServer) {
    return (
      <Alert
        type="warning"
        style={{ padding: "30px", margin: "30px" }}
        description={
          <>
            <h3>Publicly sharing of files is not enabled</h3>
            <div style={{ fontSize: "12pt" }}>
              Public sharing is not enabled. An admin of the server can enable
              this in Admin -- Site Settings -- Allow public file sharing.
            </div>
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
            <h3>
              Publicly sharing of files is not enabled from this student project
            </h3>
            <div style={{ fontSize: "12pt" }}>
              Public sharing is disabled right now for this project. This was
              set by the course instructor.
            </div>
          </>
        }
      />
    );
  }

  return (
    <div>
      <h2 style={{ color: "#666", textAlign: "center" }}>
        <a
          onClick={() => {
            redux
              .getProjectActions(props.project_id)
              ?.load_target("files/" + props.path);
          }}
        >
          {trunc_middle(props.path, 128)}
        </a>
      </h2>
      <Row gutter={GUTTER}>
        <Col span={12}>
          <VisibleMDLG>
            <div style={{ color: "#444", fontSize: "15pt" }}>Access level</div>
          </VisibleMDLG>
        </Col>
        <Col span={12}>
          <VisibleMDLG>
            <span style={{ fontSize: "15pt" }}>How it works</span>
          </VisibleMDLG>
        </Col>
      </Row>
      <Row gutter={GUTTER}>
        <Col span={12}>
          {!parent_is_public && (
            <div style={{ fontSize: "12pt", marginTop: "15px" }}>
              <Radio.Group
                value={sharingOptionsState}
                onChange={handleSharingOptionsChange}
              >
                <Space direction="vertical">
                  <Radio name="sharing_options" value="public_listed">
                    <Icon name="eye" style={{ marginRight: "5px" }} />
                    <i>Published (listed)</i> - on the{" "}
                    <A href={shareServerUrl()}>
                      public search engine indexed server
                    </A>
                    .
                  </Radio>
                  <Radio name="sharing_options" value="public_unlisted">
                    <Icon name="eye-slash" style={{ marginRight: "5px" }} />
                    <i>Published (unlisted)</i> - only people with the link can
                    view this.
                  </Radio>
                  {kucalc != KUCALC_COCALC_COM && (
                    <>
                      <Radio name="sharing_options" value="authenticated">
                        <Icon
                          name={SHARE_AUTHENTICATED_ICON}
                          style={{ marginRight: "5px" }}
                        />
                        <i>Authenticated</i> - {SHARE_AUTHENTICATED_EXPLANATION}
                        .
                      </Radio>
                    </>
                  )}

                  <Radio name="sharing_options" value="private">
                    <Icon name="lock" style={{ marginRight: "5px" }} />
                    <i>Private</i> - only collaborators on this project can view
                    this.
                  </Radio>
                </Space>
              </Radio.Group>
            </div>
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
          {" "}
          <div style={{ color: "#555", fontSize: "12pt" }}>
            You make files or directories{" "}
            <A href={server}>
              <b>
                <i>public to the world</i>,
              </b>
            </A>{" "}
            either indexed by search engines (listed), or only visible with the
            link (unlisted). Files are automatically copied to the public server
            within <b>about 30 seconds</b> after you explicitly edit them. See{" "}
            <A href={SHARE_HELP_URL}>the docs</A> for more details.
          </div>
        </Col>
      </Row>
      {sharingOptionsState != "private" && (
        <Row gutter={GUTTER} style={{ paddingTop: "12px" }}>
          <Col span={12} style={{ color: "#666" }}>
            <h4>Description{description ? "" : " (optional)"}</h4>
            Use relevant keywords, inspire curiosity by providing just enough
            information to explain what this is about, and keep your description
            to about two lines. Use Markdown and LaTeX.
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
            <h4>
              <A href="https://choosealicense.com/">
                Choose a license {license ? "" : " (optional)"}
              </A>
            </h4>
            <License
              disabled={parent_is_public}
              license={license}
              set_license={(license) => props.set_public_path({ license })}
            />
          </Col>
          <Col span={12} style={{ color: "#666" }}>
            <>
              <h4>Link</h4>
              <div style={{ paddingBottom: "5px" }}>
                Your share will appear <A href={url}>here</A>:
              </div>
              <CopyToClipBoard value={url} />
            </>
            <ConfigureName
              project_id={props.project_id}
              path={props.public?.path ?? props.path}
            />
          </Col>
        </Row>
      )}

      <Row gutter={GUTTER}>
        <Col span={24} style={{ textAlign: "center" }}>
          <Button onClick={props.close} type="primary" size="large">
            Close
          </Button>
        </Col>
      </Row>
    </div>
  );
}
