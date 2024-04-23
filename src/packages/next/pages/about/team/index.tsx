import { Layout } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";

import { TitleComponent } from "components/about/title-component";
import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import IndexList, { DataSource } from "components/landing/index-list";
import SocialMediaIconList, {
  SocialMediaIconListProps
} from "components/landing/social-media-icon-list";
import A from "components/misc/A";

import { MAX_WIDTH } from "lib/config";
import { Customize } from "lib/customize";
import withCustomize from "lib/with-customize";

import WilliamSteinImage from "public/about/william-stein.png";
import HaraldSchillyImage from "public/about/harald-schilly.jpg";
import AndreyNovoseltsevImage from "public/about/andrey-novoseltsev.jpeg";
import BlaecBejaranoImage from "public/about/blaec-bejarano.png";

const TeamSocialMediaComponent = ({ links }: Pick<SocialMediaIconListProps, 'links'>) => (
  <SocialMediaIconList
    style={{
      marginTop: "24px",
    }}
    iconFontSize={24}
    links={links}
  />
)

const dataSource: DataSource = [
  {
    link: "/about/team/william-stein",
    title: <TitleComponent
      name="William Stein"
      jobTitle="CEO and Founder of SageMath, Inc."
    />,
    image: WilliamSteinImage,
    description: (
      <>
        Get to know the math prodigy behind CoCalc and SageMath, Inc.: William
        Stein. A Berkeley graduate and an ardent mathematician with over 15
        years of experience in teaching and research, William’s passion for
        number theory and computational science has led him down a remarkable
        path.

        Learn more about William's remarkable career{" "}
        <A href="/about/team/william-stein">here</A>, or reach out to say hello
        at <A href="mailto:wstein@sagemath.com">wstein@sagemath.com</A>.

        <TeamSocialMediaComponent links={{
          facebook: "https://www.facebook.com/william.stein.37",
          github: "https://github.com/sagemathinc/cocalc",
          instagram: "https://www.instagram.com/wstein389/",
          linkedin: "https://www.linkedin.com/in/william-stein-895a26158/",
          twitter: "https://twitter.com/wstein389",
          youtube: "https://www.youtube.com/user/wstein389"
        }}/>
      </>
    ),
  },
  {
    link: "/about/team/harald-schilly",
    title: <TitleComponent
      name="Harald Schilly"
      jobTitle="CTO at SageMath, Inc."
    />,
    image: HaraldSchillyImage,
    description: (
      <>
        Harald’s life-long dedication to coding, profound knowledge, and dynamic
        personality have been invaluable in shaping CoCalc’s operations and
        success. Initially a key contributor to the SageMath open-source
        mathematics software while studying Optimization, Harald now exercises
        his talent for adopting new technologies and algorithms by consistently
        pushing CoCalc's capabilities into new and exciting territory.

        Learn more about Harald's enthusiam for software{" "}
        <A href="/about/team/harald-schilly">here</A>, or reach out to Harald
        at <A href="mailto:hsy@sagemath.com">hsy@sagemath.com</A> for more
        information about his projects or for advice on the perfect marinara
        sauce.

        <TeamSocialMediaComponent links={{
          facebook: "https://www.facebook.com/harald.schilly",
          github: "https://github.com/sagemathinc/cocalc",
          instagram: "https://www.instagram.com/ha_sch/",
          linkedin: "https://www.linkedin.com/in/harald-schilly-519b2813/",
          twitter: "https://twitter.com/Ha_Sch",
          youtube: "https://www.youtube.com/c/HaraldSchilly"
        }}/>
      </>
    ),
  },
  {
    link: "/about/team/andrey-novoseltsev",
    title: <TitleComponent
      name="Andrey Novoseltsev"
      jobTitle="COO at SageMath, Inc."
    />,
    image: AndreyNovoseltsevImage,
    description: (
      <>
        Andrey went through graduate school as a student and then an instructor
        in Russia, USA, and Canada. With an interest in software development
        starting with early childhood experience on Soviet ES EVM, he used
        SageMath extensively both in his Ph.D. research and teaching and now
        oversees day-to-day operations at SageMath, Inc.

        Learn more about Andrey's passion for CoCalc as an educational tool{" "}
        <A href="/about/team/andrey-novoseltsev">here</A>, or reach out to
        Andrey at <A href="mailto:andrey@cocalc.com">andrey@cocalc.com</A> for
        custom quotes and special care for your purchasing orders and invoices.

        <TeamSocialMediaComponent links={{
          facebook: "https://www.facebook.com/andrey.novoseltsev.351",
          github: "https://github.com/novoselt",
          instagram: "https://www.instagram.com/anovoselt/",
          linkedin: "https://www.linkedin.com/in/andrey-novoseltsev/",
        }}/>
      </>
    ),
  },
  {
    link: "/about/team/blaec-bejarano",
    title: <TitleComponent
      name="Blaec Bejarano"
      jobTitle="CSO at SageMath, Inc."
    />,
    image: BlaecBejaranoImage,
    description: (
      <>
        As a 2021 graduate from Oregon State University with an M.S. in
        Mathematics, Blaec uniquely combines advanced mathematical modeling
        skills with a thriving energy for mountain climbing and music. His
        academic expertise focuses on applying numerical analysis and partial
        differential equations to model physical phenomena.

        Learn more about Blaec's ardor for mountaineering and geophysics{" "}
        <A href="/about/team/blaec-bejarano">here</A>, or reach out to Blaec
        at <A href="mailto:blaec@cocalc.com">blaec@cocalc.com</A> to talk about
        computational applied mathematics, software development/integration
        opportunities, or possible partnerships with SageMath.

        <TeamSocialMediaComponent links={{
          facebook: "https://www.facebook.com/blaec.bejarano/",
          github: "https://github.com/sagemathinc/cocalc",
          instagram: "https://www.instagram.com/_blaec_/",
          linkedin: "https://www.linkedin.com/in/blaec-bejarano-500966b2/",
          twitter: "https://twitter.com/BlaecBejarano",
          youtube: "https://www.youtube.com/channel/UCoUBZX7c4sMcB3q6MYIW3-Q",
        }}/>
      </>
    ),
  },
] as DataSource;

export default function Team({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Meet the CoCalc Team"/>
      <Layout>
        <Header page="about" subPage="team"/>
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
            <IndexList
              title={
                <>
                  <Icon name="team-outlined" style={{ marginRight: "30px" }}/>
                  Meet the People Behind CoCalc
                </>
              }
              description={
                <>
                  SageMath, Inc. (the company behind CoCalc) comprises a small
                  yet diverse group of people worldwide who are unified behind
                  the common goal of progressing open-source mathematical
                  software and cloud-based technology for the scientific
                  community.

                  Each team member brings unique perspectives and
                  specializations that continue to push the development of
                  products like CoCalc and its features toward the frontier of
                  educational use and research.

                  As you'll see, all of our executive team members at SageMath,
                  Inc. are trained mathematicians, each with their own
                  strengths.
                </>
              }
              dataSource={dataSource}
            />
          </div>
          <Footer/>
        </Layout.Content>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
