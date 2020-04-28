import { Map } from "immutable";
import { redux, Component, React, Rendered } from "../../app-framework";
import {
  Alert,
  Button,
  ButtonToolbar,
  Checkbox,
  Row,
  Col,
  Panel,
  Well,
  FormGroup,
} from "../../antd-bootstrap";
import { SiteName, TermsOfService } from "../../customize";
import { capitalize, keys, startswith } from "smc-util/misc2";
import { set_account_table, ugly_error } from "../util";
import { webapp_client } from "../../webapp-client";
import { ErrorDisplay, Icon, Space, TimeAgo } from "../../r_misc";
import { STRATEGIES } from "./strategies";
import { SignOut } from "../sign-out";
import { DeleteAccount } from "../delete-account";
const {
  NewsletterSetting,
  EmailAddressSetting,
  EmailVerification,
} = require("../../r_account");
const { APIKeySetting } = require("../../api-key");
import { TextSetting } from "./text-setting";
import { PasswordSetting } from "./password-setting";

import { log } from "../../user-tracking";

interface Props {
  account_id?: string;
  first_name?: string;
  last_name?: string;
  email_address?: string;
  email_address_verified?: Map<string, any>;
  passports?: Map<string, any>;
  sign_out_error?: string;
  everywhere?: boolean;
  delete_account_error?: string;
  other_settings?: Map<string, any>;
  is_anonymous?: boolean;
  email_enabled?: boolean;
  verify_emails?: boolean;
  created?: Date;
}

interface State {
  add_strategy_link?: string;
  remove_strategy_button?: string;
  terms_checkbox: boolean;
  show_delete_confirmation: boolean;
}

export class AccountSettings extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = {
      add_strategy_link: undefined,
      remove_strategy_button: undefined,
      terms_checkbox: false,
      show_delete_confirmation: false,
    };
  }

  private actions() {
    return redux.getActions("account");
  }

  private handle_change(evt, field) {
    this.actions().setState({ [field]: evt.target.value });
  }

  private save_change(evt, field: string): void {
    const { value } = evt.target;
    set_account_table({ [field]: value });
  }

  private render_add_strategy_link(): Rendered {
    if (!this.state.add_strategy_link) {
      return;
    }
    const strategy = this.state.add_strategy_link;
    const name = capitalize(strategy);
    const href = `${window.app_base_url}/auth/${this.state.add_strategy_link}`;
    return (
      <Well>
        <h4>
          <Icon name={strategy} /> {name}
        </h4>
        Link to your {name} account, so you can use {name} to login to your{" "}
        <SiteName /> account.
        <br /> <br />
        <ButtonToolbar style={{ textAlign: "center" }}>
          <Button
            href={href}
            target="_blank"
            onClick={() => {
              this.setState({ add_strategy_link: undefined });
              if (this.props.is_anonymous) {
                log("add_passport", {
                  passport: name,
                  source: "anonymous_account",
                });
              }
            }}
          >
            <Icon name="external-link" /> Link My {name} Account
          </Button>
          <Button
            onClick={() => this.setState({ add_strategy_link: undefined })}
          >
            Cancel
          </Button>
        </ButtonToolbar>
      </Well>
    );
  }

  private async remove_strategy_click(): Promise<void> {
    const strategy = this.state.remove_strategy_button;
    this.setState({
      remove_strategy_button: undefined,
      add_strategy_link: undefined,
    });
    if (strategy == null) return;
    const obj = this.props.passports?.toJS() ?? {};
    let id: string | undefined = undefined;
    for (const k in obj) {
      if (startswith(k, strategy)) {
        id = k.split("-")[1];
        break;
      }
    }
    if (!id) {
      return;
    }
    try {
      await webapp_client.account_client.unlink_passport(strategy, id);
    } catch (err) {
      ugly_error(err);
    }
  }

  private render_remove_strategy_button(): Rendered {
    if (!this.state.remove_strategy_button) {
      return;
    }
    const strategy = this.state.remove_strategy_button;
    const name = capitalize(strategy);
    if ((this.props.passports?.size ?? 0) <= 1 && !this.props.email_address) {
      return (
        <Well>
          You must set an email address above or add another login method before
          you can disable login to your <SiteName /> account using your {name}{" "}
          account. Otherwise you would completely lose access to your account!
        </Well>
      );
    } else {
      return (
        <Well>
          <h4>
            <Icon name={strategy} /> {name}
          </h4>
          Your <SiteName /> account is linked to your {name} account, so you can
          login using it.
          <br /> <br />
          If you delink your {name} account, you will no longer be able to use
          your account to log into <SiteName />.
          <br /> <br />
          <ButtonToolbar style={{ textAlign: "center" }}>
            <Button
              bsStyle="danger"
              onClick={this.remove_strategy_click.bind(this)}
            >
              <Icon name="unlink" /> Delink My {name} Account
            </Button>
            <Button
              onClick={() =>
                this.setState({ remove_strategy_button: undefined })
              }
            >
              Cancel
            </Button>
          </ButtonToolbar>
        </Well>
      );
    }
  }

  private render_strategy(strategy, strategies): Rendered {
    if (strategy !== "email") {
      return (
        <Button
          disabled={this.props.is_anonymous && !this.state.terms_checkbox}
          onClick={() =>
            this.setState(
              strategies.includes(strategy)
                ? {
                    remove_strategy_button: strategy,
                    add_strategy_link: undefined,
                  }
                : {
                    add_strategy_link: strategy,
                    remove_strategy_button: undefined,
                  }
            )
          }
          key={strategy}
          bsStyle={strategies.includes(strategy) ? "info" : undefined}
        >
          <Icon name={strategy} /> {capitalize(strategy)}...
        </Button>
      );
    }
  }

  private render_sign_out_error(): Rendered {
    if (!this.props.sign_out_error) {
      return;
    }
    return (
      <ErrorDisplay
        style={{ margin: "5px 0" }}
        error={this.props.sign_out_error}
        onClose={() => this.actions().setState({ sign_out_error: "" })}
      />
    );
  }

  private render_sign_out_buttons(): Rendered {
    return (
      <Row
        style={{
          marginTop: "15px",
          borderTop: "1px solid #ccc",
          paddingTop: "15px",
        }}
      >
        <Col xs={12}>
          <div className="pull-right">
            <SignOut everywhere={false} />
            {!this.props.is_anonymous ? <Space /> : undefined}
            {!this.props.is_anonymous ? (
              <SignOut everywhere={true} />
            ) : undefined}
          </div>
        </Col>
      </Row>
    );
  }

  private render_linked_external_accounts(): Rendered {
    if (
      typeof STRATEGIES === "undefined" ||
      STRATEGIES === null ||
      STRATEGIES.length <= 1
    ) {
      // not configured by server
      return;
    }
    const configured_strategies = keys(
      this.props.passports?.toJS() ?? {}
    ).map((x) => x.slice(0, x.indexOf("-")));
    const linked: string[] = STRATEGIES.filter(
      (strategy) =>
        strategy !== "email" && configured_strategies.includes(strategy)
    );
    if (linked.length === 0) {
      return;
    }
    return (
      <div>
        <hr key="hr0" />
        <h5 style={{ color: "#666" }}>
          Your account is linked with (click to unlink)
        </h5>
        <ButtonToolbar style={{ marginBottom: "10px" }}>
          {linked.map((strategy) =>
            this.render_strategy(strategy, configured_strategies)
          )}
        </ButtonToolbar>
        {this.render_remove_strategy_button()}
      </div>
    );
  }

  private render_available_to_link(): Rendered {
    if (STRATEGIES.length <= 1) {
      // not configured by server yet, or nothing but email
      return;
    }
    const configured_strategies = keys(
      this.props.passports?.toJS() ?? {}
    ).map((x) => x.slice(0, x.indexOf("-")));
    const not_linked = STRATEGIES.filter(
      (strategy) =>
        strategy !== "email" && !configured_strategies.includes(strategy)
    );
    if (not_linked.length === 0) {
      return;
    }
    const heading = this.props.is_anonymous
      ? "Sign up using your account at"
      : "Click to link your account";
    return (
      <div>
        <hr key="hr0" />
        <h5 style={{ color: "#666" }}>{heading}</h5>
        <ButtonToolbar style={{ marginBottom: "10px" }}>
          {not_linked.map((strategy) =>
            this.render_strategy(strategy, configured_strategies)
          )}
        </ButtonToolbar>
        {this.render_add_strategy_link()}
      </div>
    );
  }

  private render_anonymous_warning(): Rendered {
    if (!this.props.is_anonymous) {
      return;
    }
    // makes no sense to delete an account that is anonymous; it'll
    // get automatically deleted.
    return (
      <div>
        <Alert bsStyle="warning" style={{ marginTop: "10px" }}>
          <h4>Sign up</h4>
          <ul>
            <li>It is free</li>
            <li>
              <b>
                <i>Avoid losing all your work</i>
              </b>
            </li>
            <li>Get added to courses and projects that you were invited to</li>
            <li>Create support tickets</li>
            <li>
              Unlock additional features and controls, including unlimited
              additional projects, realtime collaboration and much, much more
            </li>
          </ul>
          <br />
          <h4>Sign in</h4>
          If you already have a <SiteName /> account, <SignOut sign_in={true} />
        </Alert>
        <hr />
      </div>
    );
  }

  private render_delete_account(): Rendered {
    if (this.props.is_anonymous) {
      return;
    }
    return (
      <Row>
        <Col xs={12}>
          <DeleteAccount
            style={{ marginTop: "1ex" }}
            initial_click={() =>
              this.setState({ show_delete_confirmation: true })
            }
            confirm_click={() => this.actions().delete_account()}
            cancel_click={() =>
              this.setState({ show_delete_confirmation: false })
            }
            user_name={(
              this.props.first_name +
              " " +
              this.props.last_name
            ).trim()}
            show_confirmation={this.state.show_delete_confirmation}
          />
        </Col>
      </Row>
    );
  }

  private render_password(): Rendered {
    if (!this.props.email_address) {
      // makes no sense to change password if don't have an email address
      return;
    }
    return <PasswordSetting />;
  }

  private render_newsletter(): Rendered {
    return; // disabling this since we don't have a newsletter these days...
    return (
      <NewsletterSetting
        redux={redux}
        email_address={this.props.email_address}
        other_settings={this.props.other_settings}
      />
    );
  }

  private render_terms_of_service(): Rendered {
    if (!this.props.is_anonymous) {
      return;
    }
    const style: React.CSSProperties = { padding: "10px 20px" };
    if (this.state.terms_checkbox) {
      style.border = "2px solid #ccc";
    } else {
      style.border = "2px solid red";
    }
    return (
      <FormGroup style={style}>
        <Checkbox
          onChange={(e) => this.setState({ terms_checkbox: e.target.checked })}
        >
          <TermsOfService />
        </Checkbox>
      </FormGroup>
    );
  }

  private render_header(): Rendered {
    if (this.props.is_anonymous) {
      return <b>Thank you for using CoCalc!</b>;
    } else {
      return (
        <>
          <Icon name="user" /> Account
        </>
      );
    }
  }

  private render_created(): Rendered {
    if (this.props.is_anonymous || !this.props.created) {
      return;
    }
    return (
      <Row style={{ marginBottom: "15px" }}>
        <Col md={4}>Created</Col>
        <Col md={8}>
          <TimeAgo date={this.props.created} />
        </Col>
      </Row>
    );
  }

  private render_name(): Rendered {
    return (
      <>
        <TextSetting
          label="First name"
          value={this.props.first_name}
          onChange={(e) => this.handle_change(e, "first_name")}
          onBlur={(e) => this.save_change(e, "first_name")}
          maxLength={254}
          disabled={this.props.is_anonymous && !this.state.terms_checkbox}
        />
        <TextSetting
          label="Last name"
          value={this.props.last_name}
          onChange={(e) => this.handle_change(e, "last_name")}
          onBlur={(e) => this.save_change(e, "last_name")}
          maxLength={254}
          disabled={this.props.is_anonymous && !this.state.terms_checkbox}
        />
      </>
    );
  }

  private render_email_address(): Rendered {
    return (
      <EmailAddressSetting
        account_id={this.props.account_id}
        email_address={this.props.email_address}
        redux={redux}
        ref="email_address"
        maxLength={254}
        is_anonymous={this.props.is_anonymous}
        disabled={this.props.is_anonymous && !this.state.terms_checkbox}
        verify_emails={this.props.verify_emails}
      />
    );
  }

  private render_email_verification(): Rendered {
    if (
      this.props.email_enabled &&
      this.props.verify_emails &&
      !this.props.is_anonymous
    ) {
      return (
        <EmailVerification
          account_id={this.props.account_id}
          email_address={this.props.email_address}
          email_address_verified={this.props.email_address_verified}
          ref={"email_address_verified"}
        />
      );
    }
  }

  private render_api_key(): Rendered {
    if (this.props.is_anonymous) return;
    return <APIKeySetting />;
  }

  public render(): Rendered {
    return (
      <Panel header={this.render_header()}>
        {this.render_anonymous_warning()}
        {this.render_terms_of_service()}
        {this.render_name()}
        {this.render_email_address()}
        <div style={{ marginBottom: "15px" }}></div>
        {this.render_email_verification()}
        {this.render_newsletter()}
        {this.render_password()}
        {this.render_api_key()}
        {this.render_created()}
        {this.render_delete_account()}
        {this.render_linked_external_accounts()}
        {this.render_available_to_link()}
        {this.render_sign_out_buttons()}
        {this.render_sign_out_error()}
      </Panel>
    );
  }
}
