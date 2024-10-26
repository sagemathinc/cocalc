/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Card } from "antd";
import { join } from "path";
import { Rendered, useEffect, useState } from "@cocalc/frontend/app-framework";
import { Loading } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { webapp_client } from "@cocalc/frontend/webapp-client";

interface Props {
  account_id: string;
  first_name: string;
  last_name: string;
}

export function Impersonate(props: Readonly<Props>) {
  const { first_name, last_name, account_id } = props;

  const [auth_token, set_auth_token] = useState<string | null>(null);
  const [err, set_err] = useState<string | null>(null);

  async function get_token(): Promise<void> {
    try {
      const auth_token =
        await webapp_client.admin_client.get_user_auth_token(account_id);
      set_auth_token(auth_token);
      set_err(null);
    } catch (err) {
      set_err(err.toString());
      set_auth_token(null);
    }
  }

  useEffect(() => {
    get_token();
  }, []);

  function render_link(): Rendered {
    if (auth_token == null) {
      return <Loading />;
    }
    // lang_temp: https://github.com/sagemathinc/cocalc/issues/7782
    const link = join(
      appBasePath,
      `auth/impersonate?auth_token=${auth_token}&lang_temp=en`,
    );
    return (
      <div>
        <a href={link} target="_blank" rel="noopener noreferrer">
          Right click and open this link in a new incognito window, where you
          will be signed in as {first_name} {last_name}...
        </a>
        <br />
        The actual link:
        <pre style={{ fontSize: "11pt", textAlign: "center" }}>
          <a href={link} target="_blank" rel="noopener noreferrer">
            {link}
          </a>
        </pre>
      </div>
    );
  }

  function render_err(): Rendered {
    if (err != null) {
      return (
        <div>
          <b>ERROR</b> {err}
        </div>
      );
    }
  }

  return (
    <Card
      title={
        <>
          Impersonate user "{first_name} {last_name}"
        </>
      }
    >
      {render_err()}
      {render_link()}
    </Card>
  );
}
