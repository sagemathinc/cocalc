/*
 *  This file is part of CoCalc: Copyright © 2021-2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import IndexList, { DataSource } from "components/landing/index-list";
import { POLICIES } from "components/landing/sub-nav";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

const dataSourceCoCalcCom = [
  {
    link: "/policies/terms",
    title: "Terms of Service",
    logo: "thumbs-up",
    description: (
      <>
        The <A href="/policies/terms">Terms of Service</A> govern use of CoCalc.
      </>
    ),
  },
  {
    link: "/policies/privacy",
    title: "Privacy Policy",
    logo: "user-secret",
    description: (
      <>
        The <A href="/policies/privacy">Privacy Policy</A> describes how
        SageMath, Inc. collects, uses, and discloses personal data.
      </>
    ),
  },
  {
    link: "/policies/dpa",
    title: "Data Processing Addendum",
    logo: "file",
    description: (
      <>
        The <A href="/policies/dpa">Data Processing Addendum</A> sets out the
        terms that apply when SageMath, Inc. processes personal data on a
        user&apos;s behalf.
      </>
    ),
  },
  {
    link: "/policies/trust",
    title: POLICIES.trust.label,
    logo: "lock-outlined",
    description: (
      <>
        Our <A href="/policies/trust">{POLICIES.trust.label}</A> page summarizes
        CoCalc&apos;s security and compliance posture, including GDPR and SOC 2
        information.
      </>
    ),
  },
  {
    link: "/policies/thirdparties",
    title: "Third Parties",
    logo: "users",
    description: (
      <>
        The <A href="/policies/thirdparties">Third Parties</A> page lists key
        service providers used to operate CoCalc.
      </>
    ),
  },
  {
    link: "/policies/copyright",
    title: "Copyright Policy",
    logo: "dot-circle",
    description: (
      <>
        The <A href="/policies/copyright">Copyright Policy</A> explains how
        SageMath, Inc. handles copyright complaints and DMCA notices.
      </>
    ),
  },
  {
    link: "/policies/ferpa",
    title: "FERPA Compliance Statement",
    logo: "graduation-cap",
    description: (
      <>
        The <A href="/policies/ferpa">FERPA Compliance Statement</A> explains
        how CoCalc supports FERPA requirements for U.S. educational
        institutions.
      </>
    ),
  },
  {
    link: "/policies/accessibility",
    title: "Accessibility",
    logo: "eye",
    description: (
      <>
        The <A href="/policies/accessibility">Accessibility page</A> provides
        CoCalc&apos;s VPAT and general accessibility information.
      </>
    ),
  },
] as DataSource;

export default function Policies({ customize }) {
  function dataSourceOnPrem(): DataSource {
    const ret: DataSource = [];
    if (customize.imprint) {
      ret.push({
        link: "/policies/imprint",
        title: "Imprint",
        logo: "dot-circle",
        description: <></>,
      });
    }
    if (customize.policies) {
      ret.push({
        link: "/policies/policies",
        title: "Policies",
        logo: "thumbs-up",
        description: <></>,
      });
    }
    return ret;
  }

  const dataSource = customize.onCoCalcCom
    ? dataSourceCoCalcCom
    : dataSourceOnPrem();
  return (
    <Customize value={customize}>
      <Head title="Policies" />
      <Layout>
        <Header page="policies" />
        <IndexList
          title={`${customize.siteName} Policies`}
          dataSource={dataSource}
        />
        <Footer />{" "}
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
