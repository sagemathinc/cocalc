// pages/_document.tsx
import type { DocumentContext, DocumentInitialProps } from "next/document";
import Document, { Head, Html, Main, NextScript } from "next/document";
import { createCache, extractStyle, StyleProvider } from "@ant-design/cssinjs";
import { Locale } from "@cocalc/util/i18n";
import { query2locale } from "locales/misc";

export default class MyDocument extends Document<{ locale: Locale }> {
  static async getInitialProps(
    ctx: DocumentContext,
  ): Promise<DocumentInitialProps & { locale: Locale }> {
    const locale = query2locale(ctx.query);
    const cache = createCache();
    const originalRenderPage = ctx.renderPage;

    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: (App: any) => (props: any) => (
          <StyleProvider cache={cache} hashPriority="high">
            <App {...props} locale={locale} />
          </StyleProvider>
        ),
      });

    const initialProps = await Document.getInitialProps(ctx);

    // inline critical AntD CSS as real <style> tags (no script hack)
    const css = extractStyle(cache, { plain: true, types: ["style", "token"] });

    return {
      ...initialProps,
      locale,
      styles: (
        <>
          {initialProps.styles}
          <style
            // keep it obvious for debugging
            data-antd="cssinjs-ssr"
            // extractStyle returns complete <style> tags; that’s OK here
            // If you prefer only the CSS text, you can parse it, but this works well in practice.
            dangerouslySetInnerHTML={{ __html: css }}
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
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
