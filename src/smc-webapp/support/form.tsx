/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useActions, useTypedRedux } from "../app-framework";
import { Alert, FormControl, FormGroup } from "../antd-bootstrap";

export const SupportForm: React.FC = () => {
  const show = useTypedRedux("support", "show");
  const email_err = useTypedRedux("support", "email_err");
  const email = useTypedRedux("support", "email");
  const body = useTypedRedux("support", "body");
  const subject = useTypedRedux("support", "subject");

  const actions = useActions("support");

  if (!show) {
    return <div />;
  }

  return (
    <form>
      <FormGroup validationState={email_err.length > 0 ? "error" : undefined}>
        <FormControl
          label="Your email address"
          type="text"
          tabIndex={1}
          placeholder="your_email@address.com"
          value={email}
          onChange={(e) => {
            actions.set_email((e.target as HTMLInputElement).value);
          }}
        />
      </FormGroup>
      {email_err.length > 0 ? (
        <Alert bsStyle="danger">
          <div>{email_err}</div>
        </Alert>
      ) : (
        <Alert bsStyle="info">
          Please double check your email address above.
        </Alert>
      )}
      <br />
      <FormGroup>
        <FormControl
          autoFocus
          type="text"
          tabIndex={2}
          label="Message"
          placeholder="Short summary..."
          value={subject}
          onChange={(e) =>
            actions.set({ subject: (e.target as HTMLInputElement).value })
          }
        />
      </FormGroup>
      <FormGroup>
        <b>
          1. What did you do exactly? 2. What happened? 3. How did this differ
          from what you expected?
        </b>
        <FormControl
          style={{ marginTop: "15px" }}
          componentClass="textarea"
          tabIndex={3}
          placeholder="Describe in detail..."
          rows={6}
          value={body}
          onChange={(e) =>
            actions.set({ body: (e.target as HTMLTextAreaElement).value })
          }
        />
      </FormGroup>
    </form>
  );
};
