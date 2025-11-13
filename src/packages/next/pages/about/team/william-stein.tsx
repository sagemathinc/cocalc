import { Typography } from "antd";

import A from "components/misc/A";

import withCustomize from "lib/with-customize";

import WilliamSteinImage from "public/about/william-stein.png";
import { TeamBio } from "../../../components/about/team";

export default function WilliamStein({ customize }) {
  return <TeamBio
    customize={customize}
    givenName="William"
    surname="Stein"
    position="Chief Executive Officer and Founder of SageMath, Inc."
    positionShort="CEO & Founder"
    positionTimeframe="2015-present"
    image={WilliamSteinImage}
    imageAlt={"William Stein with his dog, Bella."}
    companyRole={
      <Typography.Paragraph>
        William is both the CEO and a lead software developer for both the front
        and back end of CoCalc. His involvement with SageMath development is a
        testament to his dedication and commitment. His remarkable past career,
        including a tenure as Professor of Mathematics at the University of
        Washington, adds depth to his leadership.
      </Typography.Paragraph>
    }
    personalSection={
      <>
        <Typography.Title level={5}>
          A Passionate CEO and Founder
        </Typography.Title>

        <Typography.Paragraph>
          In his role as CEO of SageMath, Inc., William is at the helm,
          navigating the future of CoCalc. His responsibilities span delegating
          tasks, driving profitability, and managing the company’s overall
          growth strategy. In addition, he maintains a close eye on developments
          within the cloud-based software industry, assesses company risks to
          ensure they’re minimized, and ensures that CoCalc remains stable and
          productive.
        </Typography.Paragraph>
      </>
    }
    background={
      <>
        <Typography.Paragraph>
          William’s academic journey began at the University of
          California, Berkeley, where he dedicated immense time and energy
          to using closed-source software like Magma for in-depth analysis
          and research. Though an admirer of its powerful underlying
          algorithms, William yearned for more transparent software that
          didn’t operate as a “black box.” His wish to understand "how
          things operate under the hood" eventually led him to
          develop <A href="https://www.sagemath.org/">SageMath</A> during
          his time as Assistant Professor of Mathematics at Harvard.
        </Typography.Paragraph>

        <Typography.Paragraph>
          April 2013 marked another momentous chapter in William’s
          professional life: he launched SageMathCloud, now known as
          CoCalc. Inspired by his experiences in the academic and
          computational fields, this web application was designed to
          enable the collaborative use of open-source software (while
          eliminating typical installation and package maintenance
          issues), thus enhancing the teaching and research process in
          mathematics and data science. CoCalc now operates under a
          corporate model, making it self-sufficient and capable of growth
          independent of grants or other external funding.
        </Typography.Paragraph>

        <Typography.Paragraph>
          William’s not all business either. You can catch him making the
          most of Seattle’s famously dismal winters by splitboarding with
          his Blue Heeler Bella in the Cascades or skating vert at "the
          most rad private ramp in Seattle."
        </Typography.Paragraph>

        <Typography.Paragraph>
          Here is his <A href="https://wstein.org/">personal website.</A>
        </Typography.Paragraph>
      </>
    }
    pastExperience={[
      {
        position: "Tenured Professor of Mathematics",
        institution: "University of Washington",
        timeframe: "2006-2019"
      },
      {
        position: "Tenured Associate Professor of Mathematics",
        institution: "University of California San Diego",
        timeframe: "2005-2006"
      },
      {
        position: "Author",
        institution: "SageMath Open-Source Software",
        timeframe: "2004"
      },
      {
        position: "Assistant Professor of Mathematics",
        institution: "Harvard University",
        timeframe: "2000-2005"
      },
      {
        position: "Ph.D. in Mathematics",
        institution: "University of California Berkeley",
        timeframe: "1995-2000"
      }
    ]}
  />;
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
