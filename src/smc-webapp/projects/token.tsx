/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Add yourself to a project using a token.

import { React, redux, useState } from "../app-framework";
import { SearchInput } from "../r_misc";
import { webapp_client } from "../webapp-client";
import { alert_message } from "../alerts";

export const AddToProjectToken: React.FC = React.memo(() => {
  const [token, set_token] = useState<string>("");

  async function do_add() {
    if (webapp_client.account_id == null) return;
    const token_id = token;
    set_token("");
    try {
      const resp = await webapp_client.project_collaborators.add_collaborator({
        account_id: webapp_client.account_id,
        token_id,
      });
      if (typeof resp.project_id == "string") {
        alert_message({
          type: "info",
          message:
            "You have been successfully added to the project, which is now being opened.",
          timeout: 10,
        });
        redux
          .getActions("projects")
          .open_project({ project_id: resp.project_id });
      } else {
        throw Error("something went wrong (this shouldn't happen)"); // should never happen.
      }
    } catch (err) {
      alert_message({ type: "error", message: err.toString(), timeout: 30 });
    }
  }

  function render_instructions() {
    return (
      <div
        style={{
          color: "#888",
          padding: "15px",
          position: "absolute",
          zIndex: 1,
          background: "#f8f8f8",
        }}
      >
        Enter a project invite token above and press enter. If the token is
        valid, you will be added as a collaborator on the corresponding project.
      </div>
    );
  }

  return (
    <div>
      <SearchInput
        value={token}
        on_change={set_token}
        placeholder="Project invite token..."
        on_submit={do_add}
      />
      {token && render_instructions()}
    </div>
  );
});
