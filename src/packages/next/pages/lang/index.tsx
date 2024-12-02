/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout, List, Typography } from "antd";

import { GetServerSidePropsContext } from "next";

import { getI18nMessages } from "locales/lib";
import { LOCALE, query2locale } from "locales/misc";

// The I18nProvider is either english by default, or based on the query path: /lang/[locale]
import I18nProvider from "next-translate/I18nProvider";

import { Icon } from "@cocalc/frontend/components/icon";
import { LOCALIZATIONS } from "@cocalc/util/i18n";

import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

function Index({ customize }) {
  const { siteName } = customize;

  const links = LOCALE.map((locale, idx) => {
    const l = LOCALIZATIONS[locale];
    return {
      locale,
      content: [
        l.flag,
        <A key={idx} href={`/${locale}`}>
          <strong>{l.native}</strong> – {l.name}
        </A>,
      ],
    };
  })
    .sort((a, b) =>
      LOCALIZATIONS[a.locale].name.localeCompare(LOCALIZATIONS[b.locale].name),
    )
    .map((item) => item.content);

  return (
    <>
      <Head title={`Translations – ${siteName}`} />
      <Layout>
        <Header />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <div
            style={{
              maxWidth: MAX_WIDTH,
              margin: "15px auto",
              padding: "15px",
              backgroundColor: "white",
            }}
          >
            <Title level={1}>
              <Icon name="global" /> Translations
            </Title>
            <Paragraph>
              <List
                header={
                  <>
                    <Paragraph>
                      We offer a dedicated landing page that provides an
                      overview of {siteName}, available in several languages.
                      Please note that all other pages are currently available
                      only in English – including the{" "}
                      <A href={"/"}>main landing page</A>.
                    </Paragraph>
                    <Paragraph>
                      Note: There is an ongoing effort to provide {siteName}'s
                      main application in all these languages as well!
                    </Paragraph>
                  </>
                }
                dataSource={links}
                bordered
                renderItem={(item) => (
                  <List.Item>
                    <Typography.Text mark>{item[0]}</Typography.Text> {item[1]}
                  </List.Item>
                )}
              />
            </Paragraph>
          </div>
          <Footer />
        </Layout.Content>
      </Layout>
    </>
  );
}

export default function I18NIndexPage({ customize, locale, messages }) {
  return (
    <Customize value={customize}>
      <I18nProvider lang={locale} namespaces={messages}>
        <Index customize={customize} />
      </I18nProvider>
    </Customize>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const locale = query2locale(context.query);
  const messages = await getI18nMessages(locale);

  return withCustomize({
    context,
    props: { locale, messages },
  });
}
