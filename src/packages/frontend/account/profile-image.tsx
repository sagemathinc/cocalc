/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import gravatarUrl from "./gravatar-url";
import { Button, Well } from "@cocalc/frontend/antd-bootstrap";
import { Component, Rendered } from "@cocalc/frontend/app-framework";
import { ErrorDisplay, Loading } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { AccountState } from "./types";
import UploadProfileImage from "./upload-profile-image";

interface ProfileImageSelectorProps {
  profile: AccountState["profile"];
  account_id: string;
  email_address: string | undefined;
}

interface ProfileImageSelectorState {
  crop;
  is_loading?: boolean;
  error?: any;
  show_default_explanation?: boolean;
  show_gravatar_explanation?: boolean;
}

export async function setProfile({ account_id, profile }) {
  await webapp_client.async_query({
    query: {
      accounts: { account_id, profile },
    },
  });
}

export class ProfileImageSelector extends Component<
  ProfileImageSelectorProps,
  ProfileImageSelectorState
> {
  private is_mounted: boolean = true;

  constructor(props: ProfileImageSelectorProps, context: any) {
    super(props, context);
    this.state = {
      crop: {
        unit: "%",
        width: 100,
        aspect: 1,
      },
    };
  }

  componentWillUnmount() {
    this.is_mounted = false;
  }

  set_image = async (src: string) => {
    this.setState({ is_loading: true });
    try {
      await setProfile({
        account_id: this.props.account_id,
        profile: { image: src },
      });
    } catch (err) {
      if (this.is_mounted) {
        this.setState({ error: `${err}` });
      }
    } finally {
      if (this.is_mounted) {
        this.setState({ is_loading: false });
      }
    }
  };

  handle_gravatar_click = () => {
    if (!this.props.email_address) {
      // Should not be necessary, but to make typescript happy.
      return;
    }
    this.set_image(gravatarUrl(this.props.email_address));
  };

  handle_default_click = () => this.set_image("");

  render_options_gravatar() {
    if (!this.props.email_address) {
      return;
    }
    return (
      <>
        <Button
          style={{ marginTop: "5px" }}
          onClick={this.handle_gravatar_click}
        >
          Gravatar
        </Button>{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            this.setState({ show_gravatar_explanation: true });
          }}
        >
          What is this?
        </a>
        {this.state.show_gravatar_explanation ? (
          <Well style={{ marginTop: "10px", marginBottom: "10px" }}>
            Gravatar is a service for using a common avatar across websites. Go
            to the{" "}
            <a href="https://en.gravatar.com" target="_blank" rel="noopener">
              Wordpress Gravatar site
            </a>{" "}
            and sign in (or create an account) using {this.props.email_address}.
            <br />
            <br />
            <Button
              onClick={() =>
                this.setState({ show_gravatar_explanation: false })
              }
            >
              Close
            </Button>
          </Well>
        ) : (
          <br />
        )}
      </>
    );
  }

  render_options() {
    return (
      <>
        <Button
          style={{ marginTop: "5px" }}
          onClick={this.handle_default_click}
        >
          Default
        </Button>{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            this.setState({ show_default_explanation: true });
          }}
        >
          What is this?
        </a>
        {this.state.show_default_explanation ? (
          <Well style={{ marginTop: "10px", marginBottom: "10px" }}>
            The default avatar is a circle with the first letter of your name.
            <br />
            <br />
            <Button
              onClick={() => this.setState({ show_default_explanation: false })}
            >
              Close
            </Button>
          </Well>
        ) : (
          <br />
        )}
        <div style={{ margin: "15px 0" }}>
          <UploadProfileImage
            account_id={this.props.account_id}
            onChange={(data) => {
              this.set_image(data);
            }}
          />
        </div>
        {this.render_options_gravatar()}
      </>
    );
  }

  render_loading() {
    return (
      <div>
        Saving... <Loading />
      </div>
    );
  }

  render_error(): Rendered {
    if (this.state.error == null) {
      return;
    }
    return (
      <ErrorDisplay
        error={this.state.error}
        onClose={() => this.setState({ error: undefined })}
      />
    );
  }

  render() {
    if (this.state.is_loading) {
      return this.render_loading();
    }
    return (
      <>
        {this.render_error()}
        <br />
        {this.render_options()}
      </>
    );
  }
}
