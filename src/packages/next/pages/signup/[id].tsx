/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";
import Main from "components/landing/main";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Customize, CustomizeType } from "lib/customize";
import withCustomize from "lib/with-customize";
import getPool from "@cocalc/database/pool";
import Link from "next/link";

interface Props {
  customize: CustomizeType;
  id: string;
  descr?: string;
  display: string;
  icon?: string;
}

export default function Signup(props: Props) {
  const { id, descr, display, icon, customize } = props;

  function main() {
    return (
      <>
        signup page main: {id} → {display}
        {descr != null && <div>{descr}</div>}
        {icon != null && (
          <div>
            <img src={icon} width={100} height={100} />
          </div>
        )}
      </>
    );
  }

  return (
    <Customize value={customize}>
      <Head title={"3rd party signup"} />
      <Layout>
        <Header />
        <div>
          <Link href={"/signup"}>back to overview</Link>
        </div>
        <Main>{main()}</Main>
        <Footer />
      </Layout>
    </Customize>
  );
}

async function getSignupInfo(id: string) {
  const pool = getPool("long");
  const { rows } = await pool.query(
    `SELECT strategy, conf FROM passport_settings WHERE strategy=$1`,
    [id]
  );
  const row = rows[0];
  return {
    id: row.strategy,
    display: row.conf.display ?? row.strategy,
    descr: row.conf.description ?? null,
    icon: row.conf.icon,
  };
}

export async function getServerSideProps(context) {
  const { id } = context.params;
  const info = await getSignupInfo(id);
  return await withCustomize({ context, props: { ...info } });
}
