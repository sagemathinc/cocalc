/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";
import Main from "components/landing/main";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import Link from "next/link";
import getPool from "@cocalc/database/pool";

/*
For development, this is a list of commands to get some suitable test data into your DB:

-- DELETE FROM passport_settings;

INSERT INTO passport_settings (strategy, conf, info)
VALUES (
    'ucla',
    '{"type": "oauth2next", "clientID": "CoCalc_Client", "scope": ["email", "profile"], "clientSecret": "sEcRet1234", "authorizationURL": "https://localhost/oauth2/authorize", "userinfoURL" :"https://localhost/oauth2/userinfo",  "tokenURL":"https://localhost/oauth2/wowtech/access_token",  "login_info" : {"emails" :"emails[0].value"}, "display": "UCLA", "icon": "https://upload.wikimedia.org/wikipedia/commons/6/6c/University_of_California%2C_Los_Angeles_logo.svg", "public": false, "exclusive_domains": ["ucla.edu"]}'::JSONB,
    '{"description": "This is the SSO mechanism for anyone associated with UCLA"}'::JSONB
);


*/


function renderSSOs(ssos) {
  return (
    <>
      {ssos.map((sso) => {
        return (
          <div key={sso.id}>
            <Link href={`/signup/${sso.id}`}>
              <a>{sso.descr}</a>
            </Link>
          </div>
        );
      })}
    </>
  );
}

function main(ssos) {
  return (
    <>
      <h1>3rd party signups</h1>
      {renderSSOs(ssos)}
    </>
  );
}

export default function SignupIndex({ customize, ssos }) {
  return (
    <Customize value={customize}>
      <Head title={"3rd party signup"} />
      <Layout>
        <Header />
        <Main>{main(ssos)}</Main>
        <Footer />
      </Layout>
    </Customize>
  );
}

async function getAllSignupInfos() {
  const pool = getPool("long");
  const { rows } = await pool.query(`
    SELECT strategy, conf
    FROM passport_settings
    WHERE coalesce(conf ->> 'public', 'true')::BOOL = FALSE`);
  return rows.map((row) => {
    return {
      id: row.strategy,
      descr: row.conf.display ?? row.strategy,
    };
  });
}

export async function getServerSideProps(context) {
  const ssos = await getAllSignupInfos();
  return await withCustomize({ context, props: { ssos } });
}
