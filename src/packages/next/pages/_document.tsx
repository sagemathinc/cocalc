/*
This custom document is needed to workaround this bug in antd + nextjs:

    https://github.com/ant-design/ant-design/issues/38767

The actual fix -- i.e., this entire file -- comes from

    https://github.com/ant-design/ant-design/issues/38767#issuecomment-1350362026

which is for a different bug in antd + nextjs, but it happens to fix
the same problem, and fortunately also works with the older nextjs 12.x, which
we are currently stuck with.

See also the discussion at https://github.com/ant-design/ant-design/issues/39891
*/

import type { DocumentContext, DocumentInitialProps } from "next/document";
import Document, { Head, Html, Main, NextScript } from "next/document";

import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";
import { Locale } from "@cocalc/util/i18n";
import { isLocale } from "locales/consts";
import { getI18nMessages } from "locales/lib";
import { I18nDictionary } from "next-translate";

export default class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext): Promise<
    DocumentInitialProps & {
      locale: Locale;
      messages: Record<string, I18nDictionary>;
    }
  > {
    const localeCtx = ctx.query.locale;
    const locale = isLocale(localeCtx) ? localeCtx : "en";
    const messages = await getI18nMessages(locale);

    const cache = createCache();
    const originalRenderPage = ctx.renderPage;

    // The IntlProvider is only for english and all components with translations in the frontend
    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: (App) => (props) =>
          (
            <StyleProvider cache={cache}>
              <App {...props} {...{ locale, messages }} />
            </StyleProvider>
          ),
      });

    const initialProps = await Document.getInitialProps(ctx);

    return {
      ...initialProps,
      messages,
      locale,
      styles: (
        <>
          {initialProps.styles}
          {/* This is hack, `extractStyle` does not currently support returning JSX or related data. */}
          <script
            dangerouslySetInnerHTML={{
              __html: `</script>${extractStyle(cache)}<script>`,
            }}
          />
        </>
      ),
    };
  }

  render() {
    return (
      <Html lang={this.props.locale}>
        <Head />
        <body>
          <pre>{JSON.stringify(this.props.locale, null, 2)}</pre>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
