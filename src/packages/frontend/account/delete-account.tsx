/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input } from "antd";
import {
  Component,
  React,
  Rendered,
  rtypes,
} from "@cocalc/frontend/app-framework";
import { ErrorDisplay, Icon } from "@cocalc/frontend/components";

interface Props {
  initial_click: () => void;
  confirm_click: () => void;
  cancel_click: () => void;
  user_name: string;
  show_confirmation?: boolean;
  style?: React.CSSProperties;
}

export function DeleteAccount(props: Props) {
  return (
    <div>
      <div style={{ height: "26px" }}>
        <Button
          disabled={props.show_confirmation}
          className="pull-right"
          style={props.style}
          onClick={props.initial_click}
        >
          <Icon name="trash" /> Delete Account...
        </Button>
      </div>
      {props.show_confirmation ? (
        <DeleteAccountConfirmation
          confirm_click={props.confirm_click}
          cancel_click={props.cancel_click}
          required_text={props.user_name}
        />
      ) : undefined}
    </div>
  );
}

interface ConfProps {
  confirm_click: () => void;
  cancel_click: () => void;
  required_text: string;
}

interface ReduxConfProps {
  account_deletion_error?: string;
}

interface State {
  confirmation_text: string;
}

// Concious choice to make them actually click the confirm delete button.
class DeleteAccountConfirmation extends Component<
  ConfProps & ReduxConfProps,
  State
> {
  constructor(props, state) {
    super(props, state);
    // State is lost on re-render from cancel. But this is what we want.
    this.state = { confirmation_text: "" };
  }

  static reduxProps() {
    return {
      account: {
        account_deletion_error: rtypes.string,
      },
    };
  }

  private render_error(): Rendered {
    if (this.props.account_deletion_error == null) {
      return;
    }
    return <ErrorDisplay error={this.props.account_deletion_error} />;
  }

  public render(): Rendered {
    return (
      <Alert
        showIcon
        type="warning"
        style={{
          marginTop: "26px",
        }}
        message="Are you sure you want to DELETE YOUR ACCOUNT?"
        description={
          <div>
            <br />
            You will <span style={{ fontWeight: "bold" }}>
              immediately
            </span>{" "}
            lose access to <span style={{ fontWeight: "bold" }}>all</span> of
            your projects, any subscriptions will be canceled, and all unspent
            credit will be lost.
            <br />
            <hr style={{ marginTop: "10px", marginBottom: "10px" }} />
            To DELETE YOUR ACCOUNT, first enter "{this.props.required_text}" below:
            <br />
            <Input
              autoFocus
              value={this.state.confirmation_text}
              placeholder="Full name"
              type="text"
              onChange={(e) => {
                this.setState({ confirmation_text: (e.target as any).value });
              }}
              style={{
                margin: "15px",
                width: "90%",
              }}
            />
            <div style={{ display: "flex" }}>
              <Button
                type="primary"
                onClick={this.props.cancel_click}
                style={{ marginRight: "15px" }}
              >
                Cancel
              </Button>
              <Button
                disabled={
                  this.state.confirmation_text !== this.props.required_text
                }
                onClick={() => this.props.confirm_click()}
              >
                <Icon name="trash" /> Yes, DELETE MY ACCOUNT
              </Button>
            </div>
            {this.render_error()}
          </div>
        }
      />
    );
  }
}
