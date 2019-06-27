/*
Configure how a path is shared.

This is used by the frontend client to configure how a path
is shared.

- Public
- Public, but need a predictable link
- Public, but needs a secret random token link
- Private

*/

const WIKI_SHARE_HELP_URL = "https://doc.cocalc.com/share.html";

import {
  Button,
  Row,
  Col,
  FormGroup,
  FormControl,
  Radio
} from "react-bootstrap";
import { React, ReactDOM, Component, Rendered } from "../../app-framework";
const { open_new_tab } = require("../../misc_page");
const { CopyToClipBoard, Icon, VisibleMDLG } = require("../../r_misc");
import { Space } from "../../r_misc/space";

import { public_share_url, share_server_url } from "./util";

interface PublicInfo {
  created: Date;
  description: string;
  disabled: boolean;
  last_edited: Date;
  path: string;
  unlisted: boolean;
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
  }) => void;
  disable_public_path: () => void;
  has_network_access?: boolean;
}

export class Configure extends Component<Props> {
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
    let description;
    const state = e.target.value;
    if (state === "private") {
      this.props.disable_public_path();
    } else if (state === "public_listed") {
      // this.props.public is suppose to work in this state
      description = this.get_description();
      this.props.set_public_path({ description, unlisted: false });
    } else if (state === "public_unlisted") {
      description = this.get_description();
      this.props.set_public_path({
        description,
        unlisted: true
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
    if (this.props.has_network_access) {
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
    const state: string = this.get_sharing_options_state();
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
    if (!parent_is_public) return;
    return <div>share warning</div>;
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

  private render_description(parent_is_public: boolean): Rendered {
    return (
      <>
        <h4>Description</h4>
        <FormGroup>
          <FormControl
            autoFocus={true}
            ref="share_description"
            key="share_description"
            type="text"
            defaultValue={this.get_description()}
            disabled={parent_is_public}
            placeholder="Description..."
            onKeyUp={this.props.action_key}
            onBlur={this.save_description.bind(this)}
          />
        </FormGroup>
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
        <CopyToClipBoard
          value={url}
          button_before={button_before}
          hide_after={true}
        />
      </>
    );
  }

  private render_public_config(parent_is_public: boolean): Rendered {
    if (!this.props.is_public) return;

    return (
      <Row>
        <Col sm={6} style={{ color: "#666" }}>
          {this.render_description(parent_is_public)}
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
        <a href={WIKI_SHARE_HELP_URL} target="_blank" rel="noopener">
          Share
        </a>{" "}
        files or directories{" "}
        <a href={server} target="_blank" rel="noopener">
          <b>
            <i>to the world</i>,
          </b>
        </a>{" "}
        either indexed by search engines (listed), or only visible with the link
        (unlisted). Files are made public about 30 seconds after you change
        them. (To instead privately collaborate, go to Project settings and "Add
        new collaborators".)
      </div>
    );
  }

  private render_close_button(): Rendered {
    return <Button onClick={this.props.close}>Close</Button>;
  }

  public render(): Rendered {
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
          <Col sm={6}>{this.render_how_shared(parent_is_public)}</Col>
          <Col sm={6}>{this.render_share_defn()}</Col>
        </Row>
        {this.render_public_config(parent_is_public)}
        <Row>
          <Col sm={12}>
            {this.render_share_warning(parent_is_public)}
            {this.render_close_button()}
          </Col>
        </Row>
      </div>
    );
  }
}
