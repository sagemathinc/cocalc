/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Add yourself to a project using a token.

import { Button } from "antd";
import { React, useState } from "../app-framework";
import { Icon, SearchInput } from "../r_misc";
import { add_self_to_project_using_token } from "../collaborators/handle-project-invite";
import { open_popup_window } from "../misc-page/open-browser-tab";

export const AddToProjectToken: React.FC = React.memo(() => {
  const [token, set_token] = useState<string>("");

  function do_add() {
    add_self_to_project_using_token(token);
    set_token("");
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
        buttonAfter={
          <Button
            style={{ height: "34px" }}
            onClick={() =>
              open_popup_window(
                "https://doc.cocalc.com/howto/project-invitation-tokens.html"
              )
            }
          >
            <Icon name="question-circle" />
          </Button>
        }
      />
      {token && render_instructions()}
    </div>
  );
});
