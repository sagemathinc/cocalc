/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import IndexList, { DataSource } from "components/landing/index-list";
import A from "components/misc/A";

const dataSourceCoCalcCom = [
  {
    link: "/policies/terms",
    title: "Terms of service",
    logo: "thumbs-up",
    description: (
      <>
        The <A href="/policies/terms">Terms of Service</A> govern use of CoCalc.
      </>
    ),
  },
  {
    link: "/policies/copyright",
    title: "Copyright policies",
    logo: "dot-circle",
    description: (
      <>
        The <A href="/policies/copyright">Copyright Policy</A> explains how
        SageMath, Inc. respects copyright policies, and provides a site that
        does not infringe on others' copyright.
      </>
    ),
  },
  {
    link: "/policies/privacy",
    title: "Privacy",
    logo: "user-secret",
    description: (
      <>
        The <A href="/policies/privacy">Privacy Policy</A> describes how
        SageMath, Inc. respects the privacy of its users.
      </>
    ),
  },
  {
    link: "/policies/thirdparties",
    title: "Third parties",
    logo: "users",
    description: (
      <>
        Our <A href="/policies/thirdparties">List of third parties</A>{" "}
        enumerates what is used to provide CoCalc.
      </>
    ),
  },
  {
    link: "/policies/ferpa",
    title: "FERPA compliance statement",
    logo: "graduation-cap",
    description: (
      <>
        <A href="/policies/ferpa">CoCalc's FERPA Compliance statement</A>{" "}
        explains how we address FERPA requirements at US educational
        instituations.
      </>
    ),
  },
  {
    link: "/policies/accessibility",
    title: "Accessibility",
    logo: "eye",
    description: (
      <>
        CoCalc's{" "}
        <A href="/policies/accessibility">
          Voluntary Product Accessibility Template (VPAT)
        </A>{" "}
        describes how we address accessibility issues.
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
  const description = customize.onCoCalcCom
    ? "SageMath, Inc.'s terms of service, copyright, privacy and other policies."
    : "";
  return (
    <Customize value={customize}>
      <Head title="Policies" />
      <Header page="policies" />
      <IndexList
        title={`${customize.siteName} Policies`}
        description={description}
        dataSource={dataSource}
      />
      <Footer />
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
