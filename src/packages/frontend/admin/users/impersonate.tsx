/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert, Card } from "antd";
import { join } from "path";

import { Rendered, useEffect, useState } from "@cocalc/frontend/app-framework";
import { Icon, Loading } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { CopyToClipBoard } from "@cocalc/frontend/components";
import { useLocalizationCtx } from "@cocalc/frontend/app/localize";

interface Props {
  account_id: string;
  first_name: string;
  last_name: string;
}

export function Impersonate({ first_name, last_name, account_id }: Props) {
  const [auth_token, set_auth_token] = useState<string | null>(null);
  const [err, set_err] = useState<string | null>(null);
  const [extraWarning, setExtraWarning] = useState<boolean>(false);
  const { locale } = useLocalizationCtx();

  async function get_token(): Promise<void> {
    try {
      const auth_token = await webapp_client.admin_client.get_user_auth_token(
        account_id,
      );
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

    // The lang_temp temporarily sets the interface language of the user to impersonate to the one of the admin
    const link = join(
      appBasePath,
      `auth/impersonate?auth_token=${auth_token}&lang_temp=${locale}`,
    );

    const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault(); // Prevent left click from opening the link
      setExtraWarning(true);
    };

    return (
      <div>
        <div style={{ fontSize: "13pt", textAlign: "center" }}>
          <a
            href={link}
            onClick={handleClick}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="external-link" /> Right click and open this link in a
            new <b>Incognito Window</b>, where you will be signed in as "
            {first_name} {last_name}"...
          </a>
          <br />
          <br />
          or copy the following link and paste it in a different browser:
          <br />
          <br />
          <CopyToClipBoard
            before
            inputWidth="500px"
            value={`${location.origin}${link}`}
          />
        </div>
        {extraWarning && (
          <Alert
            showIcon
            style={{ margin: "30px auto", maxWidth: "800px" }}
            type="warning"
            message="Open this link in a new Incognito Window!"
            description="Otherwise your current browser session will get overwritten, and potentially sensitive information could leak."
          />
        )}
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
