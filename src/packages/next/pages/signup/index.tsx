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
