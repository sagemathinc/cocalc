/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";
import { GetServerSidePropsContext } from "next";
import useTranslation from "next-translate/useTranslation";

import { TestI18N } from "@cocalc/frontend/components/test-i18n";

import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import { Tagline } from "components/landing/tagline";
import Logo from "components/logo";
import A from "components/misc/A";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";
import { LOCALES } from "locales/consts";

function Nav() {
  const links = LOCALES.map((locale, idx) => {
    return (
      <A key={idx} href={`/${locale}`} style={{ marginRight: 10 }}>
        {locale}
      </A>
    );
  });

  return <nav>{links}</nav>;
}

function Hello({ customize }) {
  const { t, lang } = useTranslation("index");
  const example = t("variable-example", { count: 42 });

  const { siteName } = customize;

  function contentDescription() {
    return "description";
  }

  return (
    <>
      <h1>{t("main.title")}</h1>
      <Nav />
      <div>lang: {JSON.stringify(lang)}</div>
      <div>example: {example}</div>
      <div>
        <TestI18N />
      </div>

      <Customize value={customize}>
        <Head title={t("main.site-description")} />
        <Layout>
          <Header />
          <Layout.Content style={{ backgroundColor: "white" }}>
            <Content
              style={{ minHeight: "30vh" }}
              body={<Logo type="full" style={{ width: "50%" }} />}
              title={siteName}
              subtitle={t("main.site-description")}
              description={contentDescription()}
            />
            <Tagline value={t("main.tagline")} style={{ padding: "5px" }} />
            <Footer />
          </Layout.Content>
        </Layout>
      </Customize>
    </>
  );
}

export default function I18NIndexPage({ customize }) {
  return (
    // <I18nProvider lang={locale} namespaces={namespaces}>
    <Hello customize={customize} />
    // </I18nProvider>
  );
}

export async function getServerSideProps(context: GetServerSidePropsContext) {
  // const locale = context.query?.locale ?? "en";
  // if (!isLocale(locale)) {
  //   throw new Error(`Invalid locale: ${locale}`);
  // }

  // const messages = await getI18nMessages(locale);

  return withCustomize({
    context,
    // props: { locale, namespaces: messages },
  });
}
