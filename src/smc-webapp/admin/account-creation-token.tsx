/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Input box for setting the account creation token.
*/

import { List } from "immutable";
import { React, Rendered, redux, TypedMap } from "../app-framework";
import { Button } from "../antd-bootstrap";
import { Well, FormGroup, FormControl } from "react-bootstrap";
import { ErrorDisplay, Saving, COLORS } from "../r_misc";
import { PassportStrategy } from "../account/passport-types";
import { query } from "../frame-editors/generic/client";
import { deep_copy } from "smc-util/misc2";

interface Props {}

type States = "load" | "error" | "view" | "edit" | "save";

export const AccountCreationToken: React.FC<Props> = () => {
  const [state, set_state] = React.useState<States>("view");
  const [data, set_data] = React.useState<any>(null);
  const [edited, set_edited] = React.useState<any>(null);
  const [error, set_error] = React.useState<string>("");
  const [show, set_show] = React.useState<boolean>(false);

  React.useEffect(() => {
    async function load() {
      let result: any;
      try {
        // TODO query should be limited by disabled != true
        result = await query({
          query: {
            account_tokens: [
              {
                token: null,
                desc: null,
                expires: null,
                counter: null,
                limit: null,
                disabled: null,
              },
            ],
          },
        });
      } catch (err) {
        set_error(err);
        set_state("error");
        return;
      }
      const data = {};
      for (const x of result.query.account_tokens) {
        data[x.token] = x.value;
      }
      set_state("edit");
      set_error("");
      set_data(data);
      set_edited(deep_copy(data));
    }

    if (show) {
      set_state("load");
      load();
    }
  }, [show]);

  function edit(): void {
    set_state("edit");
  }

  async function save(): Promise<void> {
    set_state("save");
    try {
      await query({
        query: {
          account_tokens: {
            // TODO
          },
        },
      });
      set_state("view");
      set_error("");
    } catch (err) {
      set_state("error");
      set_error(err);
    }
  }

  function render_save_button(): Rendered {
    return (
      <Button
        style={{ marginRight: "1ex" }}
        onClick={() => save()}
        bsStyle="success"
      >
        Save Token
      </Button>
    );
  }

  function render_control(): Rendered {
    switch (state) {
      case "view":
        return (
          <Button onClick={() => edit()} bsStyle="warning">
            Change Token...
          </Button>
        );
      case "edit":
        return (
          <div>
            edited: {JSON.stringify(edited)} // data: {JSON.stringify(data)}
          </div>
        );
      case "save":
        return (
          <Well>
            <form>
              <FormGroup>
                <FormControl ref="input" type="text" />
              </FormGroup>
            </form>
            {render_save_button()}
            <Button onClick={() => set_state("view")}>Cancel</Button>
          </Well>
        );
    }
  }

  function render_error(): Rendered {
    if (error) {
      return <ErrorDisplay error={error} onClose={() => set_error("")} />;
    }
  }

  function render_save(): Rendered {
    if (state === "save") {
      return <Saving />;
    }
  }

  function render_unsupported(): Rendered {
    // see https://github.com/sagemathinc/cocalc/issues/333
    return (
      <div style={{ color: COLORS.GRAY }}>
        Not supported! At least one "public" passport strategy is enabled.
      </div>
    );
  }

  function render_info(): Rendered {
    return (
      <div style={{ color: COLORS.GRAY, fontStyle: "italic" }}>
        Note: You can disable email sign up in Site Settings
      </div>
    );
  }

  // disable token editing if any strategy besides email is public
  function not_supported(strategies): boolean {
    return strategies
      .filterNot((s) => s.get("name") === "email")
      .some((s) => s.get("public"));
  }

  function render_content(): Rendered {
    const account_store: any = redux.getStore("account");
    if (account_store == null) {
      return <div>Account store not defined -- refresh your browser.</div>;
    }
    const strategies:
      | List<TypedMap<PassportStrategy>>
      | undefined = account_store.get("strategies");
    if (strategies == null) {
      // I hit this in production once and it crashed my browser.
      return <div>strategies not loaded -- refresh your browser.</div>;
    }
    if (not_supported(strategies)) {
      return render_unsupported();
    } else {
      return (
        <div>
          {render_control()}
          {render_save()}
          {render_error()}
          {render_info()}
        </div>
      );
    }
  }

  function render_body() {
    if (!show) {
      return <Button onClick={() => set_show(true)}>Load tokens ...</Button>;
    } else {
      return render_content();
    }
  }

  return (
    <div>
      <h4>Account Creation Tokens</h4>
      {render_body()}
    </div>
  );
};
