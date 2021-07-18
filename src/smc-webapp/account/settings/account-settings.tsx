/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map, List } from "immutable";
import {
  redux,
  Component,
  React,
  Rendered,
  TypedMap,
} from "../../app-framework";
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
import { keys, startswith } from "smc-util/misc";
import { set_account_table, ugly_error } from "../util";
import { webapp_client } from "../../webapp-client";
import { A, ErrorDisplay, Icon, Space, TimeAgo } from "../../r_misc";
import { SignOut } from "../sign-out";
import { DeleteAccount } from "../delete-account";
import { TextSetting } from "./text-setting";
import { PasswordSetting } from "./password-setting";
import { EmailAddressSetting } from "./email-address-setting";
import { APIKeySetting } from "./api-key";
import { EmailVerification } from "./email-verification";
import { log } from "../../user-tracking";
import { PassportStrategy } from "../passport-types";
import { PassportStrategyIcon, strategy2display } from "../../passports";
import { join } from "path";

type ImmutablePassportStrategy = TypedMap<PassportStrategy>;

interface Props {
  account_id?: string;
  first_name?: string;
  last_name?: string;
  unlisted?: boolean;
  email_address?: string;
  email_address_verified?: Map<string, any>;
  passports?: Map<string, any>;
  sign_out_error?: string;
  delete_account_error?: string;
  other_settings?: Map<string, any>;
  is_anonymous?: boolean;
  email_enabled?: boolean;
  verify_emails?: boolean;
  created?: Date;
  strategies?: List<ImmutablePassportStrategy>;
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

  private get_strategy(name: string): ImmutablePassportStrategy | undefined {
    if (this.props.strategies == null) return undefined;
    return this.props.strategies.find((val) => val.get("name") == name);
  }

  private render_add_strategy_link(): Rendered {
    if (!this.state.add_strategy_link) {
      return;
    }
    const strategy_name = this.state.add_strategy_link;
    const strategy = this.get_strategy(strategy_name);
    if (strategy == null) return;
    const strategy_js = strategy.toJS();
    const name = strategy2display(strategy_js);
    const href = join(window.app_base_path, 'auth', this.state.add_strategy_link);
    return (
      <Well>
        <h4>
          <PassportStrategyIcon strategy={strategy_js} /> {name}
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
    const strategy_name = this.state.remove_strategy_button;
    const strategy = this.get_strategy(strategy_name);
    if (strategy == null) return;
    const strategy_js = strategy.toJS();
    const name = strategy2display(strategy_js);
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
            <PassportStrategyIcon strategy={strategy_js} /> {name}
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

  private render_strategy(
    strategy: ImmutablePassportStrategy,
    account_passports: string[]
  ): Rendered {
    if (strategy.get("name") !== "email") {
      const is_configured = account_passports.includes(strategy.get("name"));
      const strategy_js = strategy.toJS();
      const btn = (
        <Button
          disabled={this.props.is_anonymous && !this.state.terms_checkbox}
          onClick={() =>
            this.setState(
              is_configured
                ? {
                    remove_strategy_button: strategy.get("name"),
                    add_strategy_link: undefined,
                  }
                : {
                    add_strategy_link: strategy.get("name"),
                    remove_strategy_button: undefined,
                  }
            )
          }
          key={strategy.get("name")}
          bsStyle={is_configured ? "info" : undefined}
        >
          <PassportStrategyIcon strategy={strategy_js} small={true} />{" "}
          {strategy2display(strategy_js)}
        </Button>
      );
      return btn;
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
            <SignOut everywhere={false} highlight={true} />
            {!this.props.is_anonymous ? <Space /> : undefined}
            {!this.props.is_anonymous ? (
              <SignOut everywhere={true} />
            ) : undefined}
          </div>
        </Col>
      </Row>
    );
  }

  private get_account_passport_names(): string[] {
    return keys(this.props.passports?.toJS() ?? {}).map((x) =>
      x.slice(0, x.indexOf("-"))
    );
  }

  private render_linked_external_accounts(): Rendered {
    if (this.props.strategies == null || this.props.strategies.size <= 1) {
      // not configured by server
      return;
    }
    const account_passports: string[] = this.get_account_passport_names();

    const linked: List<ImmutablePassportStrategy> = this.props.strategies.filter(
      (strategy) => {
        const name = strategy?.get("name");
        return name !== "email" && account_passports.includes(name);
      }
    );
    if (linked.size === 0) return;

    const btns = linked
      .map((strategy) => this.render_strategy(strategy, account_passports))
      .toArray();
    return (
      <div>
        <hr key="hr0" />
        <h5 style={{ color: "#666" }}>
          Your account is linked with (click to unlink)
        </h5>
        <ButtonToolbar style={{ marginBottom: "10px", display: "flex" }}>
          {btns}
        </ButtonToolbar>
        {this.render_remove_strategy_button()}
      </div>
    );
  }

  private render_available_to_link(): Rendered {
    if (this.props.strategies == null || this.props.strategies.size <= 1) {
      // not configured by server yet, or nothing but email
      return;
    }
    const account_passports: string[] = this.get_account_passport_names();

    const not_linked: List<ImmutablePassportStrategy> = this.props.strategies.filter(
      (strategy) => {
        const name = strategy.get("name");
        return name !== "email" && !account_passports.includes(name);
      }
    );
    if (not_linked.size === 0) return;

    const heading = this.props.is_anonymous
      ? "Sign up using your account at"
      : "Click to link your account";
    const btns = not_linked
      .map((strategy) => this.render_strategy(strategy, account_passports))
      .toArray();
    return (
      <div>
        <hr key="hr0" />
        <h5 style={{ color: "#666" }}>{heading}</h5>
        <ButtonToolbar style={{ marginBottom: "10px", display: "flex" }}>
          {btns}
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
          Signing up is free, avoids losing your work, you get added to projects
          you were invited to, and you unlock{" "}
          <A href="https://doc.cocalc.com/">many additional features</A>!
          <br />
          <br />
          <h4>Sign in</h4>
          If you already have a <SiteName /> account, <SignOut sign_in={true} />
          . Note that you will lose any work you've done anonymously here.
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
          checked={this.state.terms_checkbox}
          onChange={(e) => this.setState({ terms_checkbox: e.target.checked })}
        >
          <TermsOfService style={{ display: "inline" }} />
        </Checkbox>
      </FormGroup>
    );
  }

  private render_header(): Rendered {
    if (this.props.is_anonymous) {
      return (
        <b>
          Thank you for using <SiteName />!
        </b>
      );
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
    if (!this.props.account_id) {
      return; // makes no sense to change email if there is no account
    }
    return (
      <EmailAddressSetting
        account_id={this.props.account_id}
        email_address={this.props.email_address}
        is_anonymous={this.props.is_anonymous}
        disabled={this.props.is_anonymous && !this.state.terms_checkbox}
        verify_emails={this.props.verify_emails}
      />
    );
  }

  private render_unlisted(): Rendered {
    if (!this.props.account_id) {
      return; // makes no sense to change email if there is no account
    }
    return (
      <Checkbox
        checked={this.props.unlisted}
        onChange={
          (e) => this.actions().set_account_table({ unlisted: e.target.checked })
          //this.actions().setState({ unlisted: !!e.target.checked })
        }
      >
        Unlisted: you can only be found by an exact email address match
      </Checkbox>
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
          email_address={this.props.email_address}
          email_address_verified={this.props.email_address_verified}
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
        {this.render_unlisted()}
        <div style={{ marginBottom: "15px" }}></div>
        {this.render_email_verification()}
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
