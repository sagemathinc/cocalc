/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { DownOutlined } from "@ant-design/icons";
import type { MenuProps } from "antd";
import { Button, Dropdown, Layout } from "antd";

import { GetServerSidePropsContext } from "next";

import Trans from "next-translate/Trans";
import useTranslation from "next-translate/useTranslation";

import { getI18nMessages } from "locales/lib";
import { LOCALE, query2locale } from "locales/misc";

// The I18nProvider is either english by default, or based on the query path: /lang/[locale]
import I18nProvider from "next-translate/I18nProvider";

import AIAvatar from "@cocalc/frontend/components/ai-avatar";
import { LOCALIZATIONS } from "@cocalc/util/i18n";
import { COLORS } from "@cocalc/util/theme";

import Content from "components/landing/content";
import Footer from "components/landing/footer";
import Head from "components/landing/head";
import Header from "components/landing/header";
import Image from "components/landing/image";
import Info from "components/landing/info";
import Pitch from "components/landing/pitch";
import { Tagline } from "components/landing/tagline";
import { SHADOW } from "components/landing/util";
import Logo from "components/logo";
import { CSS, Paragraph, Title } from "components/misc";
import A from "components/misc/A";
import { Customize, useCustomize } from "lib/customize";
import withCustomize from "lib/with-customize";
import basePath from "lib/base-path";

import SAGEMATH_JUPYTER from "public/cocalc-sagemath-2024-11-22-nq8.png";
import assignments from "public/features/cocalc-course-assignments-2019.png";
import LatexEditorImage from "public/features/cocalc-latex-editor-2019.png";
import RTC from "public/features/cocalc-real-time-jupyter.png";
import CHATROOM from "/public/features/chatroom.png";
import JupyterTF from "/public/features/cocalc-jupyter2-20170508.png";
import terminal from "/public/features/terminal.png";
import { join } from "path";

const HEADER_LEVEL = 3;

function Nav() {
  const { t, lang } = useTranslation("index");

  const items: MenuProps["items"] = [...LOCALE]
    .sort((a, b) => LOCALIZATIONS[a].name.localeCompare(LOCALIZATIONS[b].name))
    .map((locale, idx) => {
      const l = LOCALIZATIONS[locale];
      return {
        key: idx,
        label: (
          <A href={`/${locale}`}>
            {l.flag} {l.native} ({l.name})
          </A>
        ),
      };
    });

  const l = LOCALIZATIONS[lang];
  const color = COLORS.GRAY_DD;
  return (
    <div
      style={{
        padding: "5px 20px",
        backgroundColor: COLORS.YELL_LLL,
        color,
      }}
    >
      {t("translated-info", {
        lang: l.native,
      })}{" "}
      <A href={"/"}>{t("home-page")}</A>.
      <span style={{ float: "right" }}>
        <Dropdown
          menu={{ items }}
          trigger={["click"]}
          placement={"bottomRight"}
          overlayStyle={{ maxHeight: "75vh", overflow: "auto", ...SHADOW }}
        >
          <a onClick={(e) => e.preventDefault()} style={{ color }}>
            {l.flag} {l.native} ({l.name}) <DownOutlined />
          </a>
        </Dropdown>
      </span>
    </div>
  );
}

function Features() {
  const { onCoCalcCom } = useCustomize();
  const { t } = useTranslation("index");

  function vendorOpenWorld() {
    return (
      <Pitch
        style={{ backgroundColor: COLORS.YELL_LLL }}
        col1={
          <Info
            anchor="a-vendor-lockin"
            icon="lock"
            level={HEADER_LEVEL}
            title={t("no-vendor-lockin")}
          >
            <Trans
              i18nKey="index:no-vendor-lockin-text"
              components={{ ul: <ul />, li: <li />, strong: <strong /> }}
            />
          </Info>
        }
        col2={
          <Info
            anchor="a-open-world"
            icon="global"
            level={HEADER_LEVEL}
            title={t("open-world-title")}
          >
            <Trans
              i18nKey="index:open-world-text"
              components={{ ul: <ul />, li: <li />, strong: <strong /> }}
            />
          </Info>
        }
      />
    );
  }

  function realtimeChat() {
    return (
      <Pitch
        style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
        col1={
          <Info
            level={HEADER_LEVEL}
            title={t("realtime-collaboration")}
            icon="users"
            anchor="a-realtimesync"
            style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
            belowWide={true}
            icons={[
              { icon: "jupyter", link: "/features/jupyter-notebook" },
              { icon: "tex", title: "LaTeX", link: "/features/latex-editor" },
              {
                icon: "slides",
                title: "Whiteboard",
                link: "/features/whiteboard",
              },
            ]}
          >
            <Paragraph>
              <Image shadow alt={"Realtime collaboration"} src={RTC} />
            </Paragraph>
            <Trans
              i18nKey="index:realtime-collaboration-text"
              components={{ strong: <strong />, p: <Paragraph /> }}
            />
          </Info>
        }
        col2={
          <Info
            level={HEADER_LEVEL}
            title={t("chat-title")}
            icon="comment"
            anchor="a-chat-title"
            style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
            belowWide={true}
            icons={[
              { icon: "comment", link: "https://doc.cocalc.com/chat.html" },
              {
                icon: <AIAvatar size={32} />,
                title: "LLM",
                link: "/features/ai",
              },
            ]}
          >
            <Paragraph>
              <Image shadow alt={"Chatroom"} src={CHATROOM} />
            </Paragraph>
            <Trans
              i18nKey="index:chat-text"
              components={{
                p: <Paragraph />,
                ul: <ul />,
                li: <li />,
                strong: <strong />,
                A: <A href="https://doc.cocalc.com/chat.html" />,
              }}
            />
          </Info>
        }
      />
    );
  }

  function softwareCompute() {
    return (
      <Pitch
        style={{ backgroundColor: COLORS.YELL_LLL }}
        col1={
          <Info
            level={HEADER_LEVEL}
            title={t("many-languages")}
            icon="flow-chart"
            anchor="a-many-languages"
            icons={[
              { icon: "julia", link: "/features/julia" },
              { icon: "linux", link: "/features/linux" },
              { icon: "python", link: "/features/python" },
              { icon: "r", link: "/features/r-statistical-software" },
              { icon: "sagemath", title: "SageMath", link: "/features/sage" },
              { icon: "octave", link: "/features/octave" },
            ]}
          >
            <Trans
              i18nKey="index:many-languages-text"
              components={{
                strong: <strong />,
                a: <A href="https://doc.cocalc.com/howto/index.html" />,
              }}
            />
          </Info>
        }
        col2={
          <Info
            level={HEADER_LEVEL}
            title={t("compute-servers-title")}
            icon="server"
            anchor="a-compute-servers"
            icons={[
              {
                icon: "nvidia",
                title: "GPUs",
                link: "https://doc.cocalc.com/compute_server.html",
              },
              {
                icon: "pytorch",
                title: "PyTorch",
                link: "https://doc.cocalc.com/compute_server.html",
              },
              {
                icon: "tensorflow",
                title: "TensorFlow",
                link: "https://doc.cocalc.com/compute_server.html",
              },
              {
                icon: "vscode",
                title: "VS Code",
                link: "https://doc.cocalc.com/vscode.html",
              },
              {
                icon: "desktop",
                title: "X11 Desktop",
                link: "features/x11",
              },
              {
                icon: "terminal",
                title: "Linux Terminal",
                link: "features/terminal",
              },
            ]}
          >
            <Trans
              i18nKey="index:compute-servers-text"
              components={{
                strong: <strong />,
                p: <Paragraph />,
                A1: <A href="https://doc.cocalc.com/compute_server.html" />,
                A2: (
                  <A href="https://github.com/sagemathinc/cocalc-howto/blob/main/README.md" />
                ),
              }}
            />
          </Info>
        }
      />
    );
  }

  function jupyterLatex() {
    return (
      <Pitch
        style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
        col1={
          <Info
            level={HEADER_LEVEL}
            title={t("jupyter-notebook-title")}
            icon="jupyter"
            anchor="a-jupyter-notebook"
            wide
            style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
            icons={[
              { icon: "jupyter", link: "/features/jupyter-notebook" },
              {
                icon: "pencil",
                title: "nbgrader",
                link: "https://doc.cocalc.com/teaching-nbgrader.html",
              },
              {
                icon: <AIAvatar size={32} />,
                title: "LLM",
                link: "/features/ai",
              },
            ]}
          >
            <Paragraph>
              <Image shadow alt={"Jupyter Notebook"} src={JupyterTF} />
            </Paragraph>
            <Trans
              i18nKey="index:jupyter-notebook-text"
              components={{
                strong: <strong />,
                a: <A href="/features/jupyter-notebook" />,
                A2: <A href="/features/teaching" />,
                AI: <A href="/features/ai" />,
                li: <li />,
                ul: <ul />,
                p: <Paragraph />,
              }}
            />
          </Info>
        }
        col2={
          <Info
            level={HEADER_LEVEL}
            title={t("latex-editor-title")}
            icon="tex"
            anchor="a-latex-editor"
            wide
            style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
            icons={[
              { icon: "tex", title: "LaTeX", link: "/features/latex-editor" },
            ]}
          >
            <Paragraph>
              <Image shadow alt={"LaTeX Editor"} src={LatexEditorImage} />
            </Paragraph>
            <Trans
              i18nKey="index:latex-editor-text"
              components={{
                strong: <strong />,
                a: <A href="/features/latex-editor" />,
                li: <li />,
                ul: <ul />,
                p: <Paragraph />,
              }}
            />
          </Info>
        }
      />
    );
  }

  function teachingLinux() {
    return (
      <Pitch
        style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
        col1={
          <Info
            level={HEADER_LEVEL}
            title={t("linux-title")}
            icon="jupyter"
            anchor="a-linux"
            wide
            style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
            icons={[
              {
                icon: "terminal",
                title: "Linux Terminal",
                link: "/features/terminal",
              },
              { icon: "servers", title: "Software", link: "/software" },
            ]}
          >
            <Paragraph>
              <Image shadow alt={"Linux Terminal"} src={terminal} />
            </Paragraph>
            <Trans
              i18nKey="index:linux-text"
              components={{
                strong: <strong />,
                A: <A href="/features/terminal" />,
                A2: <A href="/software/executables" />,
                li: <li />,
                ul: <ul />,
                p: <Paragraph />,
              }}
            />
          </Info>
        }
        col2={
          <Info
            level={HEADER_LEVEL}
            title={t("teaching-title")}
            icon="graduation-cap"
            anchor="a-teaching"
            wide
            style={{ backgroundColor: COLORS.ANTD_BG_BLUE_L }}
            icons={[
              {
                icon: "graduation-cap",
                title: "Teaching",
                link: "/features/teaching",
              },
              {
                icon: "pencil",
                title: "nbgrader",
                link: "https://doc.cocalc.com/teaching-nbgrader.html",
              },
            ]}
          >
            <Paragraph>
              <Image
                shadow
                alt={"CoCalc Course Management"}
                src={assignments}
              />
            </Paragraph>
            <Trans
              i18nKey="index:teaching-text"
              components={{
                strong: <strong />,
                A: <A href="/features/teaching" />,
                li: <li />,
                ul: <ul />,
                p: <Paragraph />,
              }}
            />
          </Info>
        }
      />
    );
  }

  function gettingStarted() {
    const style: CSS = { color: COLORS.GRAY_LL } as const;

    if (onCoCalcCom) {
      return (
        <Pitch
          title={t("getting-started")}
          style={{ backgroundColor: COLORS.BLUE_D, ...style }}
          col1={
            <Info
              level={HEADER_LEVEL}
              title={t("gettingstarted-saas")}
              anchor="a-saas"
              style={{ backgroundColor: COLORS.BLUE_D }}
              textStyle={style}
            >
              <Trans
                i18nKey="index:gettingstarted-saas-text"
                components={{
                  strong: <strong />,
                  A2: <A style={style} href="/auth/sign-up" />,
                  A: <A style={style} href="/store" />,
                  li: <li style={style} />,
                  ul: <ul />,
                  p: <Paragraph style={style} />,
                }}
              />
              <Paragraph style={{ textAlign: "center" }}>
                <Button
                  ghost
                  size="large"
                  style={{ fontWeight: "bold" }}
                  onClick={() =>
                    (window.location.href = join(basePath, "/auth/sign-up"))
                  }
                  title={t("sign-up")}
                >
                  {t("sign-up")}
                </Button>
              </Paragraph>
            </Info>
          }
          col2={
            <Info
              level={HEADER_LEVEL}
              title={t("gettingstarted-onprem")}
              anchor="a-onprem"
              style={{ backgroundColor: COLORS.BLUE_D }}
              textStyle={style}
            >
              <Trans
                i18nKey="index:gettingstarted-onprem-text"
                components={{
                  strong: <strong />,
                  A: <A style={style} href="https://onprem.cocalc.com" />,
                  li: <li style={style} />,
                  ul: <ul />,
                  p: <Paragraph style={style} />,
                }}
              />
              <Paragraph style={{ textAlign: "center" }}>
                <Button
                  ghost
                  size="large"
                  style={{ fontWeight: "bold" }}
                  onClick={() =>
                    (window.location.href = join(basePath, "/pricing/onprem"))
                  }
                  title={"On-Premises"}
                >
                  {t("gettingstarted-onprem")}
                </Button>
              </Paragraph>
            </Info>
          }
        />
      );
    } else {
      return (
        <Info
          level={HEADER_LEVEL}
          title={t("getting-started")}
          anchor="a-signup"
          style={{ backgroundColor: COLORS.BLUE_D }}
          textStyle={style}
        >
          <Trans
            i18nKey="index:gettingstarted-signup-text"
            components={{
              strong: <strong />,
              A: <A style={style} href="/auth/sign-up" />,
              li: <li />,
              ul: <ul />,
              p: <Paragraph style={{ ...style, textAlign: "center" }} />,
            }}
          />
          <Paragraph style={{ textAlign: "center" }}>
            <Button
              ghost
              size="large"
              style={{ fontWeight: "bold" }}
              onClick={() =>
                (window.location.href = join(basePath, "/auth/sign-up"))
              }
              title={t("sign-up")}
            >
              {t("sign-up")}
            </Button>
          </Paragraph>
        </Info>
      );
    }
  }

  return (
    <>
      {realtimeChat()}
      {softwareCompute()}
      {jupyterLatex()}
      {vendorOpenWorld()}
      {teachingLinux()}
      {gettingStarted()}
    </>
  );
}

function Hello({ customize }) {
  const { t } = useTranslation("index");

  const { siteName } = customize;

  function intro() {
    return (
      <>
        <Title level={2}>{t("intro")}</Title>{" "}
        <Paragraph>
          <Trans i18nKey="index:intro-1" components={{ strong: <strong /> }} />
        </Paragraph>
        <Paragraph>
          <Image
            alt={t('screenshot')}
            src={SAGEMATH_JUPYTER}
            shadow={true}
          />
        </Paragraph>
      </>
    );
  }

  return (
    <>
      <Head title={`${t("site-description")} – ${siteName}`} />
      <Layout>
        <Header />
        <Nav />
        <Layout.Content style={{ backgroundColor: "white" }}>
          <Content
            style={{ minHeight: "30vh" }}
            body={<Logo type="full" style={{ width: "50%" }} />}
            title={siteName}
            subtitle={t("site-description")}
            imageAlternative={intro()}
          />
          <Tagline value={t("tagline")} style={{ padding: "5px" }} />
          <Features />
          <Nav />
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
        <Hello customize={customize} />
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
