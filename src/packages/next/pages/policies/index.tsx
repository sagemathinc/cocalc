import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import IndexList, { DataSource } from "components/landing/index-list";

const dataSource = [
  {
    link: "/policies/terms",
    title: "Terms of service",
    logo: "thumbs-up",
    description: <>These govern use of CoCalc.</>,
  },
  {
    link: "/policies/copyright",
    title: "Copyright policies",
    logo: "dot-circle",
    description: (
      <>
        How SageMath, Inc. respects copyright policies, and seeks to provide a
        site that does not infringe on others' copyright.
      </>
    ),
  },
  {
    link: "/policies/privacy",
    title: "Privacy",
    logo: "user-secret",
    description: (
      <>How SageMath, Inc. seeks to respect the privacy of its users.</>
    ),
  },
  {
    link: "/policies/thirdparties",
    title: "Third parties",
    logo: "users",
    description: <>List of third parties used to provide CoCalc.</>,
  },
  {
    link: "/policies/ferpa",
    title: "FERPA compliance statement",
    logo: "graduation-cap",
    description: <>CoCalc's FERPA Compliance statement.</>,
  },
    {
    link: "/policies/accessibility",
    title: "Accessibility",
    logo: "eye",
    description: <>CoCalc Voluntary Product Accessibility Template (VPAT)</>,
  },
] as DataSource;

export default function Policies({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Policies" />
      <Header page="policies" />
      <IndexList
        title="CoCalc Policies"
        description="SageMath, Inc.'s terms of service, copyright, privacy and other policies."
        dataSource={dataSource}
      />
      <Footer />
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
