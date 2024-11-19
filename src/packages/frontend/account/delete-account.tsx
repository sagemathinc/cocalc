/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Button, Input } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import {
  React,
  Rendered,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { ErrorDisplay, Icon } from "@cocalc/frontend/components";
import { CancelText } from "@cocalc/frontend/i18n/components";

interface Props {
  initial_click: () => void;
  confirm_click: () => void;
  cancel_click: () => void;
  user_name: string;
  show_confirmation?: boolean;
  style?: React.CSSProperties;
}

export function DeleteAccount(props: Props) {
  const intl = useIntl();

  return (
    <div>
      <div style={{ height: "26px" }}>
        <Button
          disabled={props.show_confirmation}
          className="pull-right"
          style={props.style}
          onClick={props.initial_click}
        >
          <Icon name="trash" />{" "}
          {intl.formatMessage({
            id: "account.delete-account.button",
            defaultMessage: "Delete Account",
          })}
          ...
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

// Concious choice to make them actually click the confirm delete button.
function DeleteAccountConfirmation({
  confirm_click,
  cancel_click,
  required_text,
}: ConfProps) {
  const intl = useIntl();

  const account_deletion_error = useTypedRedux(
    "account",
    "account_deletion_error",
  );

  // State is lost on re-render from cancel. But this is what we want.
  const [confirmation_text, set_confirmation_text] = useState<string>("");

  function render_error(): Rendered {
    if (account_deletion_error == null) {
      return;
    }
    return <ErrorDisplay error={account_deletion_error} />;
  }

  return (
    <Alert
      showIcon
      type="warning"
      style={{
        marginTop: "26px",
      }}
      message={
        <FormattedMessage
          id="account.delete-account.alert.message"
          defaultMessage={"Are you sure you want to DELETE YOUR ACCOUNT?"}
        />
      }
      description={
        <div>
          <br />
          <FormattedMessage
            id="account.delete-account.alert.description"
            defaultMessage={`You will <b>immediately</b> lose access to <b>all</b> of your projects,
            any subscriptions will be canceled, and all unspent credit will be lost.
            {br}
            {hr}
            To DELETE YOUR ACCOUNT, first enter "{required_text}" below:`}
            values={{
              required_text: required_text,
              br: <br />,
              hr: <hr style={{ marginTop: "10px", marginBottom: "10px" }} />,
            }}
          />
          <br />
          <Input
            autoFocus
            value={confirmation_text}
            placeholder="Full name"
            type="text"
            onChange={(e) => {
              set_confirmation_text((e.target as any).value);
            }}
            style={{
              margin: "15px",
              width: "90%",
            }}
          />
          <div style={{ display: "flex" }}>
            <Button
              type="primary"
              onClick={cancel_click}
              style={{ marginRight: "15px" }}
            >
              <CancelText />
            </Button>
            <Button
              disabled={confirmation_text !== required_text}
              onClick={() => confirm_click()}
            >
              <Icon name="trash" />{" "}
              {intl.formatMessage({
                id: "account.delete-account.confirmation",
                defaultMessage: "Yes, DELETE MY ACCOUNT",
              })}
            </Button>
          </div>
          {render_error()}
        </div>
      }
    />
  );
}
