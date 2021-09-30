import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import IndexList, { DataSource } from "components/landing/index-list";

const dataSource = [
  {
    link: "/pricing/products",
    title: "Products",
    logo: "credit-card",
    description: (
      <>Overview of what you can purchase to enhance your use of CoCalc.</>
    ),
  },
  {
    link: "/pricing/subscriptions",
    title: "Subscriptions",
    logo: "calendar",
    description:
      "How to keep some of your projects upgraded via a periodic subscription.",
  },
  {
    link: "/pricing/courses",
    title: "Courses",
    logo: "graduation-cap",
    description: "What to purchase when using CoCalc to teach a course.",
  },
  {
    link: "/pricing/dedicated",
    title: "Dedicated Virtual Machines",
    logo: "server",
    description:
      "A dedicated powerful virtual machine or large disk can greatly improve collaboration and scalability in your research group.",
  },
  {
    link: "/pricing/onprem",
    title: "On Premises Installations",
    logo: "laptop",
    description: "You can run CoCalc on your own laptop, server or cluster.",
  },
] as DataSource;

export default function Pricing({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Pricing" />
      <Header page="pricing" />
      <IndexList
        title="Subscriptions and Pricing"
        description="CoCalc products and subscriptions"
        dataSource={dataSource}
      />
      <Footer />
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
