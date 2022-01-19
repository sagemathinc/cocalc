import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import IndexList, { DataSource } from "components/landing/index-list";
import A from "components/misc/A";

const dataSource = [
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
    link: "/pricing/dedicated",
    title: "Dedicated Resources",
    logo: "server",
    description: (
      <>
        How to{" "}
        <A href="/pricing/dedicated">
          rent a dedicated powerful virtual machine or large dedicated disk
        </A>
        , which can greatly improve collaboration and scalability in your
        research group.
      </>
    ),
  },
  {
    link: "/pricing/onprem",
    title: "On Premises Installations",
    logo: "laptop",
    description: (
      <>
        You can run CoCalc on{" "}
        <A href="/pricing/onprem">your own laptop, server or cluster.</A>
      </>
    ),
  },
] as DataSource;

export default function Pricing({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Pricing" />
      <Header page="pricing" />
      <IndexList
        title="Subscriptions and Pricing"
        description={
          <>
            You can read more about {customize.siteName} products and
            subscriptions below or <A href="/store">visit the store</A>.
          </>
        }
        dataSource={dataSource}
      />
      <Footer />
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
