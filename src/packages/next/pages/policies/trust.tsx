import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import { POLICIES } from "components/landing/sub-nav";
import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

import SOC2LOGO from "public/soc2-aicpa-logo.png";

const GDPR_BADGE_HTML = `
<html>
  <head>
    <style>
      .verificationBadgeContainer {
        display: inline-block;
        text-align: left;
      }
    </style>
  </head>
  <body>
    <div id="gdprVerifier"></div>
    <script>
      (function(w,d,s,o,f,js,fjs){
        w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
        js=d.createElement(s),fjs=d.getElementsByTagName(s)[0];
        js.id=o;js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
      }(window,document,'script','gdprBadge','https://cdn.gdprlocal.com/static/widget.js'));

      gdprBadge('init', {
        element: document.getElementById('gdprVerifier'),
        verificationId: 'RNCB5WV'
      });
    </script>
  </body>
</html>
`;

export default function Trust({ customize }) {
  return (
    <Customize value={customize}>
      <Head title={POLICIES.trust.label} />
      <Layout>
        <Header page="policies" subPage="trust" />
        <Layout.Content
          style={{
            backgroundColor: "white",
          }}
        >
          <div
            style={{
              maxWidth: MAX_WIDTH,
              margin: "15px auto",
              padding: "15px",
              backgroundColor: "white",
            }}
          >
            <Title level={1} style={{ textAlign: "center" }}>
              <Icon name="lock-outlined" /> CoCalc - Security and Compliance (
              {POLICIES.trust.label})
            </Title>
            <Title level={2}>GDPR</Title>
            <Paragraph>
              SageMath, Inc. compliance with{" "}
              <A href={"https://gdpr-info.eu/"}>GDPR</A> has been verified by
              our EU and UK representative{" "}
              <A hfre={"https://gdprlocal.com/"}>GDPR Local</A>.
            </Paragraph>
            <Paragraph>
              <iframe
                srcDoc={GDPR_BADGE_HTML}
                sandbox="allow-scripts"
                style={{
                  width: "100%",
                  height: "180px",
                  border: "none",
                  overflow: "auto",
                }}
              />
            </Paragraph>
            <Title level={2}>SOC 2</Title>
            <Paragraph>
              CoCalc by SageMath, Inc. is{" "}
              <Text strong>
                <A href="https://www.vanta.com/collection/soc-2/what-is-soc-2">
                  SOC 2 compliant
                </A>
              </Text>
              , meaning we meet rigorous standards for data security and
              operational integrity. This compliance is verified through
              independent audits, ensuring that we effectively protect customer
              information across security, availability, processing integrity,
              confidentiality, and privacy. Our commitment to these high
              standards enhances trust and reliability for our users.
            </Paragraph>
            <Paragraph strong>
              Please learn more about the current status in{" "}
              <A href="https://trust.cocalc.com/">
                Sagemath, Inc.'s Trust Center
              </A>
              .
            </Paragraph>
            <Paragraph>
              <Image
                style={{ width: "150px", margin: "auto", height: "150px" }}
                src={SOC2LOGO}
                alt={"SOC 2 Compliance Logo"}
              />
            </Paragraph>
            <h2>Questions?</h2>
            <Paragraph>
              Please contact us at{" "}
              <A href="mailto:office@sagemath.com">office@sagemath.com</A> if
              you have any questions.
            </Paragraph>
          </div>
          <Footer />
        </Layout.Content>{" "}
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
