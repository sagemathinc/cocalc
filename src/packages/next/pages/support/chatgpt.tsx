import { Layout } from "antd";
import Header from "components/landing/header";
import Head from "components/landing/head";
import Footer from "components/landing/footer";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import ChatGPTHelp from "components/openai/chatgpt-help";

export default function ChatgptInfo({ customize }) {
  const { siteName } = customize;
  return (
    <Customize value={customize}>
      <Head title="Your Support Tickets" />
      <Layout>
        <Header page="support" subPage="chatgpt" />
        <div style={{ margin: "15px auto" }}>
          <div style={{ maxWidth: "1000px" }}>
            Our integrated ChatGPT support is free and often very helpful since
            it knows so much about the open source software in {siteName}. You
            can ask a question below or use @chatgpt in any chat message when
            using {siteName}.
            <ChatGPTHelp
              style={{ marginTop: "15px" }}
              size="large"
              tag="support-chatgpt"
            />
          </div>
        </div>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
