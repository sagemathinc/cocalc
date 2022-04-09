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

import {
  Alert,
  Button,
  Row,
  Col,
  FormGroup,
  FormControl,
  Radio,
} from "react-bootstrap";
import {
  redux,
  ReactDOM,
  Component,
  Rendered,
  rclass,
  rtypes,
} from "@cocalc/frontend/app-framework";
import { open_new_tab } from "@cocalc/frontend/misc";
import {
  CopyToClipBoard,
  Icon,
  VisibleMDLG,
  Space,
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

  // redux props
  is_commercial?: boolean;
  share_server?: boolean;
  kucalc?: string;
}

type States = "private" | "public_listed" | "public_unlisted" | "authenticated";

interface State {
  sharing_options_state: States;
}

class Configure extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { sharing_options_state: this.get_sharing_options_state() };
  }

  public static reduxProps(): object {
    return {
      customize: {
        is_commercial: rtypes.bool,
        share_server: rtypes.bool,
        kucalc: rtypes.string,
      },
    };
  }

  private render_how_shared_heading(): Rendered {
    return <div style={{ color: "#444", fontSize: "15pt" }}>Access level</div>;
  }

  private render_how_shared(parent_is_public: boolean): Rendered {
    if (parent_is_public) {
      return;
    }
    return (
      <div style={{ fontSize: "12pt" }}>{this.render_sharing_options()}</div>
    );
  }

  private handle_sharing_options_change(e): void {
    const state: States = e.target.value;
    this.setState({ sharing_options_state: state });
    switch (state) {
      case "private":
        this.props.set_public_path(SHARE_FLAGS.DISABLED);
        break;
      case "public_listed":
        // this.props.public is suppose to work in this state
        this.props.set_public_path(SHARE_FLAGS.LISTED);
        break;
      case "public_unlisted":
        this.props.set_public_path(SHARE_FLAGS.UNLISTED);
        break;
      case "authenticated":
        this.props.set_public_path(SHARE_FLAGS.AUTHENTICATED);
        break;
      default:
        unreachable(state);
    }
  }

  private get_sharing_options_state(): States {
    if (
      this.props.is_public &&
      (this.props.public != null ? this.props.public.unlisted : undefined)
    ) {
      return "public_unlisted";
    }
    if (this.props.is_public && this.props.public?.authenticated === true) {
      return "authenticated";
    }
    if (
      this.props.is_public &&
      !(this.props.public != null ? this.props.public.unlisted : undefined)
    ) {
      return "public_listed";
    }
    return "private";
  }

  private render_public_listed_option(state: string): Rendered {
    if (!this.props.is_commercial || this.props.has_network_access) {
      return (
        <Radio
          name="sharing_options"
          value="public_listed"
          checked={state === "public_listed"}
          onChange={this.handle_sharing_options_change.bind(this)}
          inline
        >
          <Icon name="eye" />
          <Space />
          <i>Public (listed)</i> - on the{" "}
          <A href={shareServerUrl()}>public Google-indexed server</A>.
        </Radio>
      );
    } else {
      return (
        <Radio
          disabled={true}
          name="sharing_options"
          value="public_listed"
          checked={state === "public_listed"}
          inline
        >
          <Icon name="eye" />
          <Space />
          <del>
            <i>Public (listed)</i> - This will appear on the{" "}
            <A href={shareServerUrl()}>share server</A>.
          </del>{" "}
          Public (listed) is only available for projects with network enabled.
        </Radio>
      );
    }
  }

  private render_public_unlisted_option(state: string): Rendered {
    return (
      <Radio
        name="sharing_options"
        value="public_unlisted"
        checked={state === "public_unlisted"}
        onChange={this.handle_sharing_options_change.bind(this)}
        inline
      >
        <Icon name="eye-slash" />
        <Space />
        <i>Public (unlisted)</i> - only people with the link can view this.
      </Radio>
    );
  }

  private render_authenticated_option(state: string): Rendered {
    // auth-only sharing only for private instances like on-prem and docker
    if (this.props.kucalc === KUCALC_COCALC_COM) return;
    return (
      <>
        <br />
        <Radio
          name="sharing_options"
          value="authenticated"
          checked={state === "authenticated"}
          onChange={this.handle_sharing_options_change.bind(this)}
          inline
        >
          <Icon name={SHARE_AUTHENTICATED_ICON} />
          <Space />
          <i>Authenticated</i> - {SHARE_AUTHENTICATED_EXPLANATION}.
        </Radio>
      </>
    );
  }

  private render_private_option(state: string): Rendered {
    return (
      <Radio
        name="sharing_options"
        value="private"
        checked={state === "private"}
        onChange={this.handle_sharing_options_change.bind(this)}
        inline
      >
        <Icon name="lock" />
        <Space />
        <i>Private</i> - only collaborators on this project can view this.
      </Radio>
    );
  }

  private render_sharing_options(): Rendered {
    const state: string = this.state.sharing_options_state;
    return (
      <FormGroup>
        {this.render_public_listed_option(state)}
        <br />
        {this.render_public_unlisted_option(state)}
        {this.render_authenticated_option(state)}
        <br />
        {this.render_private_option(state)}
      </FormGroup>
    );
  }

  private render_share_warning(parent_is_public: boolean): Rendered {
    if (!parent_is_public || this.props.public == null) return;
    const path = this.props.public.path;
    return (
      <Alert bsStyle="warning" style={{ wordWrap: "break-word" }}>
        <h4>
          <Icon name="exclamation-triangle" /> Public folder
        </h4>
        <p>
          This {this.props.isdir ? "directory" : "file"} is public because it is
          in the public folder "{path}". You must adjust the sharing
          configuration of that folder instead.
        </p>
      </Alert>
    );
  }

  private save_description(): void {
    const elt = ReactDOM.findDOMNode(this.refs.share_description);
    if (elt == null) return;
    this.props.set_public_path({ description: elt.value });
  }

  private get_description(): string {
    return this.props.public != null && this.props.public.description != null
      ? this.props.public.description
      : "";
  }

  private get_license(): string {
    return this.props.public != null && this.props.public.license != null
      ? this.props.public.license
      : "";
  }

  private render_description(parent_is_public: boolean): Rendered {
    return (
      <>
        <h4>Description{this.get_description() ? "" : " (optional)"}</h4>
        Use relevant keywords, inspire curiosity by providing just enough
        information to explain what this is about, and keep your description to
        about two lines. Use Markdown and LaTeX.
        <FormGroup style={{ paddingTop: "5px" }}>
          <FormControl
            autoFocus={true}
            ref="share_description"
            key="share_description"
            componentClass="textarea"
            defaultValue={this.get_description()}
            disabled={parent_is_public}
            placeholder="Describe what you are sharing.  You can change this at any time."
            onKeyUp={this.props.action_key}
            onBlur={this.save_description.bind(this)}
          />
        </FormGroup>
      </>
    );
  }

  private set_license(license: string): void {
    this.props.set_public_path({ license });
  }

  private render_license(parent_is_public: boolean): Rendered {
    return (
      <>
        <h4>
          <A href="https://choosealicense.com/">
            Choose a license {this.get_license() ? "" : " (optional)"}
          </A>
        </h4>
        <License
          disabled={parent_is_public}
          license={this.get_license()}
          set_license={this.set_license.bind(this)}
        />
      </>
    );
  }

  private render_link(parent_is_public: boolean): Rendered {
    const url = publicShareUrl(
      this.props.project_id,
      parent_is_public && this.props.public != null
        ? this.props.public.path
        : this.props.path,
      this.props.path
    );
    const button_before = (
      <Button bsStyle="default" onClick={() => open_new_tab(url)}>
        <Icon name="external-link" />
      </Button>
    );

    return (
      <>
        <h4>Link</h4>
        <div style={{ paddingBottom: "5px" }}>Your share will appear here.</div>
        <CopyToClipBoard
          value={url}
          buttonBefore={button_before}
          hideAfter={true}
        />
      </>
    );
  }

  private render_public_config(parent_is_public: boolean): Rendered {
    if (this.state.sharing_options_state === "private") return;

    return (
      <Row>
        <Col sm={6} style={{ color: "#666" }}>
          {this.render_description(parent_is_public)}
          {this.render_license(parent_is_public)}
        </Col>
        <Col sm={6} style={{ color: "#666" }}>
          {this.render_link(parent_is_public)}
          <ConfigureName
            project_id={this.props.project_id}
            path={this.props.public?.path ?? this.props.path}
          />
        </Col>
      </Row>
    );
  }

  private render_share_defn(): Rendered {
    const server = shareServerUrl();
    return (
      <div style={{ color: "#555", fontSize: "12pt" }}>
        <A href={SHARE_HELP_URL}>You make</A> files or directories{" "}
        <A href={server}>
          <b>
            <i>public to the world</i>,
          </b>
        </A>{" "}
        either indexed by search engines (listed), or only visible with the link
        (unlisted). Files are automatically copied to the public server within
        about 30 seconds after you explicitly edit them.
      </div>
    );
  }

  private render_close_button(): Rendered {
    return <Button onClick={this.props.close}>Close</Button>;
  }

  private render_needs_network_access(parent_is_public: boolean): Rendered {
    const url =
      this.props.public == null || this.props.public.disabled
        ? undefined
        : publicShareUrl(
            this.props.project_id,
            parent_is_public && this.props.public != null
              ? this.props.public.path
              : this.props.path,
            this.props.path
          ) + "?edit=true";
    return (
      <Alert bsStyle={"warning"} style={{ padding: "30px", margin: "30px" }}>
        <h3>Publicly sharing files requires internet access</h3>
        <div style={{ fontSize: "12pt" }}>
          You <b>must</b> first enable the 'Internet access' upgrade in project
          settings in order to publicly share files from this project.
          {url && (
            <div>
              <br />
              This file was shared when internet access was enabled, so you can{" "}
              <A href={url}>edit how this file is shared here</A>.
            </div>
          )}
        </div>
      </Alert>
    );
  }

  private render_share_server_disabled(): Rendered {
    return (
      <Alert bsStyle={"warning"} style={{ padding: "30px", margin: "30px" }}>
        <h3>Publicly sharing of files not enabled on this CoCalc server.</h3>
        <div style={{ fontSize: "12pt" }}>
          Public sharing is not enabled. An admin of the server can enable this
          in Admin -- Site Settings -- Allow public file sharing.
        </div>
      </Alert>
    );
  }

  public render(): Rendered {
    // This path is public because some parent folder is public.
    const parent_is_public: boolean =
      !!this.props.is_public &&
      this.props.public != null &&
      this.props.public.path != this.props.path;

    if (!this.props.share_server) {
      return this.render_share_server_disabled();
    }
    if (this.props.is_commercial && !this.props.has_network_access) {
      return this.render_needs_network_access(parent_is_public);
    }

    return (
      <div>
        <div style={{ float: "right" }}>{this.render_close_button()}</div>
        <h2 style={{ color: "#666", textAlign: "center" }}>
          <a
            onClick={() => {
              redux
                .getProjectActions(this.props.project_id)
                ?.load_target("files/" + this.props.path);
            }}
          >
            {trunc_middle(this.props.path, 128)}
          </a>
        </h2>
        <Row>
          <VisibleMDLG>
            <Col sm={6}>{this.render_how_shared_heading()}</Col>
            <Col sm={6}>
              <span style={{ fontSize: "15pt" }}>How it works</span>
            </Col>
          </VisibleMDLG>
        </Row>
        <Row>
          <Col sm={6}>
            {this.render_how_shared(parent_is_public)}
            {this.render_share_warning(parent_is_public)}
          </Col>
          <Col sm={6}>{this.render_share_defn()}</Col>
        </Row>
        {this.render_public_config(parent_is_public)}
        <Row>
          <Col sm={12}>{this.render_close_button()}</Col>
        </Row>
      </div>
    );
  }
}

const tmp = rclass(Configure);
export { tmp as Configure };
