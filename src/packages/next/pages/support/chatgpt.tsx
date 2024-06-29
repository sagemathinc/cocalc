import { Layout } from "antd";

import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import ChatGPTHelp from "components/openai/chatgpt-help";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

export default function ChatgptInfo({ customize }) {
  const { siteName, onCoCalcCom } = customize;

  function renderChatGPT() {
    return (
      <div style={{ maxWidth: "1000px" }}>
        Our integrated AI support is often very helpful since it knows so much
        about the open source software in {siteName}. You can ask a question
        below or use @ mention an AI model in any chat message when using{" "}
        {siteName}.
        <ChatGPTHelp
          style={{ marginTop: "15px" }}
          size="large"
          tag="support-chatgpt"
        />
      </div>
    );
  }

  return (
    <Customize value={customize}>
      <Head title="Your Support Tickets" />
      <Layout>
        <Header page="support" subPage="chatgpt" />
        <div style={{ margin: "15px auto" }}>
          {onCoCalcCom ? renderChatGPT() : "disabled"}
        </div>
        <Footer />
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
