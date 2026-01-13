/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import IndexList, { DataSource } from "components/landing/index-list";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

const dataSource: DataSource = [
  {
    link: "/store",
    title: "Store",
    logo: "shopping-cart",
    description: (
      <>
        Purchase a license for upgrades or dedicated resources at{" "}
        <A href="/store">the store</A>.
      </>
    ),
  },
  {
    link: "/pricing/products",
    title: "Products",
    logo: "credit-card",
    description: (
      <>
        Overview of <A href="/pricing/products">what you can purchase</A> to
        enhance your use of CoCalc.
      </>
    ),
  },
  {
    link: "/pricing/subscriptions",
    title: "Subscriptions",
    logo: "calendar",
    description: (
      <>
        How to keep some of your projects upgraded via{" "}
        <A href="/pricing/subscriptions">a periodic subscription.</A>
      </>
    ),
  },
  {
    link: "/pricing/courses",
    title: "Courses",
    logo: "graduation-cap",
    description: (
      <>
        What to purchase when{" "}
        <A href="/pricing/courses">
          <b>using CoCalc to teach a course.</b>
        </A>
      </>
    ),
  },
  {
    link: "/pricing/institutions",
    title: "Institutions",
    logo: "home",
    description: (
      <>
        What to purchase when{" "}
        <A href="/pricing/institutions">
          <b>using CoCalc in an institution.</b>
        </A>
      </>
    ),
  },
  {
    link: "/pricing/onprem",
    title: "On-Premises Installations",
    logo: "server",
    description: (
      <>
        You can run CoCalc on{" "}
        <A href="/pricing/onprem">your own Kubernetes cluster.</A>
      </>
    ),
  },
  {
    link: "/vouchers",
    title: "Vouchers",
    logo: "gift",
    description: (
      <>
        Vouchers are a convenient way to{" "}
        <A href="/vouchers">share and resell licenses</A>.
      </>
    ),
  },
];

export default function Pricing({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Pricing" />
      <Layout>
        <Header page="pricing" />
        <IndexList
          title="Products and Pricing"
          description={
            <>
              You can read more about {customize.siteName}{" "}
              <A href="/pricing/products">products</A> and{" "}
              <A href="/pricing/subscriptions">subscriptions</A> below or{" "}
              <A href="/store">visit the store</A>.
            </>
          }
          dataSource={dataSource}
        />
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
