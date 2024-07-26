/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import Tables, { Disclaimer } from "components/landing/compare";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import SignIn from "components/landing/sign-in";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

const component = "CoCalc";
const title = "CoCalc v Competition";

export default function Octave({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="compare" />
        <Layout.Content>
          <div
            style={{
              backgroundColor: COLORS.LANDING.TOP_BG,
              textAlign: "center",
              padding: "60px 0",
            }}
          >
            <Icon
              style={{ fontSize: "100pt", marginBottom: "50px" }}
              name="table"
            />
            <h1 style={{ fontSize: "26pt" }}>
              Comparing CoCalc to the Competition
            </h1>
            <SignIn startup={"CoCalc"} />
          </div>

          <Disclaimer />

          <Tables />

          <SignIn startup={component} />
        </Layout.Content>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
