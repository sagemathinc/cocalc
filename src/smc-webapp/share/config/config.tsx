/*
Configure how a path is shared.

This is used by the frontend client to configure how a path
is shared.

- Public
- Public, but need a predictable link
- Public, but needs a secret random token link
- Private

*/

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
const { CopyToClipBoard, Icon } = require("../../r_misc");
import { Space } from "../../r_misc/space";

import { construct_public_share_url } from "./util";

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
  private render_how_shared(parent_is_public: boolean): Rendered {
    if (parent_is_public) {
      return;
    }
    return (
      <div>
        <br />
        <div style={{ color: "#444", fontSize: "15pt" }}>
          Choose how to share {this.props.path}:
        </div>
        <br />
        {this.render_sharing_options()}
      </div>
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
          <i>Public (listed)</i> - This will appear on the{" "}
          <a href="https://share.cocalc.com/share" target="_blank">
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
            <a href="https://share.cocalc.com/share" target="_blank">
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

  private render_share_warning(parent_is_public:boolean): Rendered {
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

  private render_path(): Rendered {
    return <span>{this.props.path}</span>;
  }

  private render_link(): Rendered {
    const url = construct_public_share_url(
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
        <h4>Shared publicly</h4>
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
        <Col sm={4} style={{ color: "#666" }}>
          {this.render_description(parent_is_public)}
        </Col>
        <Col sm={4} style={{ color: "#666" }}>
          <h4>Items</h4>
          {this.render_path()}
        </Col>
        <Col sm={4} style={{ color: "#666" }}>
          {this.render_link()}
        </Col>
      </Row>
    );
  }

  private render_share_defn(): Rendered {
    return <div>share defn</div>;
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
          <Col sm={8} style={{ color: "#666", fontSize: "12pt" }}>
            {this.render_share_defn()}
          </Col>
        </Row>
        <Row>
          <Col sm={12} style={{ fontSize: "12pt" }}>
            {this.render_how_shared(parent_is_public)}
          </Col>
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
