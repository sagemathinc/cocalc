/*
Configure how a path is shared.

This is used by the frontend client to configure how a path
is shared.

- Public
- Public, but need a predictable link
- Public, but needs a secret random token link
- Private

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
  Radio
} from "react-bootstrap";
import {
  React,
  ReactDOM,
  Component,
  Rendered,
  rclass,
  rtypes
} from "../../app-framework";
const { open_new_tab } = require("../../misc_page");
const { CopyToClipBoard, Icon, VisibleMDLG } = require("../../r_misc");
import { Space } from "../../r_misc/space";

import { public_share_url, share_server_url } from "./util";

import { License } from "./license";

interface PublicInfo {
  created: Date;
  description: string;
  disabled: boolean;
  last_edited: Date;
  path: string;
  unlisted: boolean;
  license?: string;
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
  }) => void;
  has_network_access?: boolean;

  // redux props
  is_commercial?: boolean;
}

interface State {
  sharing_options_state: string;
}

class Configure extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { sharing_options_state: this.get_sharing_options_state() };
  }

  public static reduxProps(): object {
    return {
      customize: {
        is_commercial: rtypes.bool
      }
    };
  }

  private render_how_shared_heading(): Rendered {
    return (
      <div style={{ color: "#444", fontSize: "15pt" }}>
        How the {this.props.isdir ? "directory" : "file"}{" "}
        <span style={{ fontFamily: "monospace" }}>"{this.props.path}"</span> is
        shared
      </div>
    );
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
    const state = e.target.value;
    this.setState({ sharing_options_state: state });
    if (state === "private") {
      this.props.set_public_path({ disabled: true });
    } else if (state === "public_listed") {
      // this.props.public is suppose to work in this state
      this.props.set_public_path({
        unlisted: false,
        disabled: false
      });
    } else if (state === "public_unlisted") {
      this.props.set_public_path({
        unlisted: true,
        disabled: false
      });
    }
  }

  private get_sharing_options_state(): string {
    if (
      this.props.is_public &&
      (this.props.public != null ? this.props.public.unlisted : undefined)
    ) {
      return "public_unlisted";
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
          <a href={share_server_url()} target="_blank">
            public share server
          </a>
          .
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
            <a href={share_server_url()} target="_blank">
              share server
            </a>
            .
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
        <i>Public (unlisted)</i> - Only people with the link can view this.
      </Radio>
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
        <i>Private</i> - Only collaborators on this project can view this.
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
        about two lines.
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
          <a href="https://choosealicense.com/" target="_blank" rel="noopener">
            Choose a license {this.get_license() ? "" : " (optional)"}
          </a>
        </h4>
        <License
          disabled={parent_is_public}
          license={this.get_license()}
          set_license={this.set_license.bind(this)}
        />
      </>
    );
  }

  private render_link(): Rendered {
    const url = public_share_url(
      this.props.project_id,
      this.props.path,
      this.props.isdir
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
          button_before={button_before}
          hide_after={true}
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
          {this.render_link()}
        </Col>
      </Row>
    );
  }

  private render_share_defn(): Rendered {
    const server = share_server_url();
    return (
      <div style={{ color: "#555", fontSize: "12pt" }}>
        <a href={SHARE_HELP_URL} target="_blank" rel="noopener">
          You share
        </a>{" "}
        files or directories{" "}
        <a href={server} target="_blank" rel="noopener">
          <b>
            <i>to the world</i>,
          </b>
        </a>{" "}
        either indexed by search engines (listed), or only visible with the link
        (unlisted). Files are automatically made public about 30 seconds any
        time you change them. (To instead privately collaborate, go to Project
        settings and "Add new collaborators".)
      </div>
    );
  }

  private render_close_button(): Rendered {
    return (
      <div>
        <br />
        <Button onClick={this.props.close}>Close</Button>
      </div>
    );
  }

  private render_needs_network_access(): Rendered {
    return (
      <Alert
        bsStyle={"danger"}
        style={{ padding: "30px", marginBottom: "30px" }}
      >
        <h3>Publicly sharing files requires internet access</h3>
        <div style={{ fontSize: "12pt" }}>
          You <b>must</b> first enable the 'Internet access' upgrade in project
          settings in order to publicly share files from this project.
        </div>
      </Alert>
    );
  }

  public render(): Rendered {
    if (this.props.is_commercial && !this.props.has_network_access) {
      return this.render_needs_network_access();
    }

    // This path is public because some parent folder is public.
    const parent_is_public: boolean =
      !!this.props.is_public &&
      this.props.public != null &&
      this.props.public.path != this.props.path;

    return (
      <div>
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
