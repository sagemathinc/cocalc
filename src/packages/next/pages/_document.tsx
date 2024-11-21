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

import { query2locale } from "locales/misc";

export default class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext): Promise<
    DocumentInitialProps & {
      locale: Locale;
    }
  > {
    const locale = query2locale(ctx.query);

    const cache = createCache();
    const originalRenderPage = ctx.renderPage;

    // The IntlProvider is only for english and all components with translations in the frontend
    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: (App) => (props) =>
          (
            <StyleProvider cache={cache}>
              <App {...props} {...{ locale }} />
            </StyleProvider>
          ),
      });

    const initialProps = await Document.getInitialProps(ctx);

    return {
      ...initialProps,
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

  // TODO: this "lang={...}" is only working for the very first page that's being loaded
  // next's dynamic page updates to not have an impact on this. So, to really fix this, we
  // probably have to get rid of this _document customization and update to version 15 properly.
  render() {
    return (
      <Html lang={this.props.locale}>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
