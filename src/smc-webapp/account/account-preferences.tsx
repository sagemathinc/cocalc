/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Component, React, Rendered } from "../app-framework";
import { ProfileSettings } from "./profile-settings";
import { TerminalSettings } from "./terminal-settings";
import { KeyboardSettings } from "./keyboard-settings";
import { AccountSettings } from "./settings/account-settings";
import { Row, Col } from "../antd-bootstrap";
import { Footer } from "../customize";
import { OtherSettings } from "./other-settings";
import { EditorSettings } from "./editor-settings/editor-settings";
import { Loading } from "../r_misc";

interface Props {
  account_id?: string;
  first_name?: string;
  last_name?: string;
  email_address?: string;
  email_address_verified?;
  passports?;
  sign_out_error?: string;
  terminal?;
  evaluate_key?: string;
  autosave?: number;
  tab_size?: number;
  font_size?: number;
  editor_settings?;
  other_settings?;
  groups?;
  stripe_customer?;
  is_anonymous?: boolean;
  email_enabled?: boolean;
  verify_emails?: boolean;
  created?: Date;
  strategies?;
}

export class AccountPreferences extends Component<Props> {
  private render_account_settings(): Rendered {
    return (
      <AccountSettings
        account_id={this.props.account_id}
        first_name={this.props.first_name}
        last_name={this.props.last_name}
        email_address={this.props.email_address}
        email_address_verified={this.props.email_address_verified}
        passports={this.props.passports}
        sign_out_error={this.props.sign_out_error}
        other_settings={this.props.other_settings}
        is_anonymous={this.props.is_anonymous}
        email_enabled={this.props.email_enabled}
        verify_emails={this.props.verify_emails}
        created={this.props.created}
        strategies={this.props.strategies}
      />
    );
  }

  private render_other_settings(): Rendered {
    if (this.props.other_settings == null) return <Loading />;
    return (
      <OtherSettings
        other_settings={this.props.other_settings}
        is_stripe_customer={
          !!this.props.stripe_customer?.getIn(["subscriptions", "total_count"])
        }
      />
    );
  }

  private render_all_settings(): Rendered {
    return (
      <div style={{ marginTop: "1em" }}>
        <Row>
          <Col xs={12} md={6}>
            {this.render_account_settings()}
            <ProfileSettings
              email_address={this.props.email_address}
              first_name={this.props.first_name}
              last_name={this.props.last_name}
            />
            {this.render_other_settings()}
          </Col>
          <Col xs={12} md={6}>
            <EditorSettings
              autosave={this.props.autosave}
              tab_size={this.props.tab_size}
              font_size={this.props.font_size}
              editor_settings={this.props.editor_settings}
              email_address={this.props.email_address}
            />
            <TerminalSettings terminal={this.props.terminal} />
            <KeyboardSettings evaluate_key={this.props.evaluate_key} />
          </Col>
        </Row>
        <Footer />
      </div>
    );
  }

  public render(): Rendered {
    if (this.props.is_anonymous) {
      return this.render_account_settings();
    } else {
      return this.render_all_settings();
    }
  }
}
