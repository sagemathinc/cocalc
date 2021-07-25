/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useState } from "react";
import { React, useTypedRedux } from "../app-framework";
import { WELL_STYLE } from "./sign-up";
import { UNIT } from "../r_misc";
const { Button, Checkbox, FormGroup, Well } = require("react-bootstrap");
const { TermsOfService } = require("../customize");
import { do_anonymous_setup } from "../client/anonymous-setup";
import { webapp_client } from "../webapp-client";

interface Props {
  show_terms: boolean;
}

export const RunAnonymously: React.FC<Props> = (params) => {
  const { show_terms } = params;
  const allow_anon = useTypedRedux("customize", "allow_anonymous_sign_in") ?? true;

  const [anon_checkbox, set_anon_checkbox] = useState(!show_terms);
  const site_name = useTypedRedux("customize", "site_name");

  if (!allow_anon) return null;   // important -- this must be after any use hooks above!

  const run_anonymously = (e) => {
    e.preventDefault();
    // do not create a default project if launching a custom image or a share
    // this will be done by the usual launch actions
    do_anonymous_setup(webapp_client);
  };

  return (
    <Well style={WELL_STYLE}>
      <div>
        Alternatively, {show_terms && "accept the Terms of Service and "}
        evaluate {site_name} without making an account.
      </div>

      <form
        style={{ marginTop: UNIT, marginBottom: UNIT }}
        onSubmit={run_anonymously}
      >
        {show_terms && (
          <FormGroup style={{ margin: "20px" }}>
            <Checkbox onChange={(e) => set_anon_checkbox(e.target.checked)}>
              <TermsOfService />
            </Checkbox>
          </FormGroup>
        )}
        <Button
          style={{ marginBottom: UNIT, marginTop: UNIT }}
          disabled={!anon_checkbox}
          bsStyle={"default"}
          bsSize={"large"}
          type={"submit"}
          block
        >
          Run {site_name} now and sign up later
        </Button>
      </form>
    </Well>
  );
};
