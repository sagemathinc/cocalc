/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";

import OpenAIAvatar from "@cocalc/frontend/components/openai-avatar";
import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import SignIn from "components/landing/sign-in";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import ChatGptInChatroom from "/public/features/chatgpt-fix-code.png";

const component = "OpenAI's ChatGPT";
const title = `OpenAI ChatGPT`;

export default function ChatGPT({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={title} />
      <Layout>
        <Header page="features" subPage="openai-chatgpt" />
        <Layout.Content>
          <Content
            landing
            startup={component}
            logo={<OpenAIAvatar size={128} />}
            title={title}
            subtitleBelow={true}
            subtitle={
              <>
                <div>
                  <A href={"https://openai.com/"}>{component}</A> is ...
                </div>
              </>
            }
            image={ChatGptInChatroom}
            alt={"ChatGPT in CoCalc"}
            caption={"ChatGPT in a CoCalc Chatroom"}
          />

          <Pitch
            col1={
              <>
                <Title level={2}>Pitch1</Title>
                <Paragraph>CoCalc is ...</Paragraph>
              </>
            }
            col2={
              <>
                <Title level={2}>Pitch2</Title>
                <Paragraph>
                  <ul>...</ul>
                </Paragraph>
              </>
            }
          />

          <Info.Heading description={"....."}>
            Integrations of ChatGPT in CoCalc
          </Info.Heading>

          <Info
            title="Help fixing code"
            icon="bug"
            image={ChatGptInChatroom}
            anchor="a-swirl"
            alt="Using Swirl via X11 to do the basic programming course"
            wide
          >
            <Paragraph>text</Paragraph>
          </Info>

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
