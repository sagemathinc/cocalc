/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";

import { alert_message } from "@cocalc/frontend/alerts";
import { Button } from "@cocalc/frontend/antd-bootstrap";
import {
  Rendered,
  useEffect,
  useIsMountedRef,
  useState,
} from "@cocalc/frontend/app-framework";
import { LabeledRow } from "@cocalc/frontend/components";
import { webapp_client } from "@cocalc/frontend/webapp-client";

interface Props {
  email_address?: string;
  email_address_verified?: Map<string, boolean>;
}

export function EmailVerification({
  email_address,
  email_address_verified,
}: Props) {
  const is_mounted = useIsMountedRef();
  const [disabled_button, set_disabled_button] = useState(false);

  useEffect(() => {
    set_disabled_button(false);
  }, [email_address]);

  async function verify(): Promise<void> {
    try {
      await webapp_client.account_client.send_verification_email();
    } catch (err) {
      const err_msg = `Problem sending email verification: ${err}`;
      console.log(err_msg);
      alert_message({ type: "error", message: err_msg });
    } finally {
      if (is_mounted.current) {
        set_disabled_button(true);
      }
    }
  }

  function render_status(): Rendered {
    if (email_address == null) {
      return <span>Unknown</span>;
    } else {
      if (email_address_verified?.get(email_address)) {
        return <span style={{ color: "green" }}>Verified</span>;
      } else {
        return (
          <>
            <span key={1} style={{ color: "red", paddingRight: "3em" }}>
              Not Verified
            </span>
            <Button
              onClick={verify}
              bsStyle="success"
              disabled={disabled_button}
            >
              {disabled_button ? "Email Sent" : "Send Verification Email"}
            </Button>
          </>
        );
      }
    }
  }

  return (
    <LabeledRow label="Email verification" style={{ marginBottom: "15px" }}>
      <div>Status: {render_status()}</div>
    </LabeledRow>
  );
}
