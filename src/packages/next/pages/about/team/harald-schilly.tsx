import { Typography } from "antd";

import { TeamBio } from "components/about/team";
import withCustomize from "lib/with-customize";

import HaraldSchillyImage from "public/about/harald-schilly.jpg";

export default function HaraldSchilly({ customize }) {
  return <TeamBio
    customize={customize}
    givenName="Harald"
    surname="Schilly"
    position="Chief Technology Officer at SageMath, Inc."
    positionShort="CTO"
    positionTimeframe="2015-present"
    image={HaraldSchillyImage}
    imageAlt={"Harald with his dog."}
    companyRole={
      <Typography.Paragraph>
        At SageMath, Inc., Harald assumes the role of a tech torchbearer,
        evaluating new technologies and implementing various libraries for
        CoCalc projects. His relentless efforts translate into the seamless
        front-end and back-end software development and maintenance for Sage and
        CoCalc alike.
      </Typography.Paragraph>
    }
    personalSection={
      <>
        <Typography.Paragraph>
          Harald isn’t all work, though. He savors his free time by reconnecting
          with nature and playing maestro in the kitchen, whipping up enticing
          Italian meals like pasta, pizza, and lasagna. Additionally, he is an
          enthusiast of Bitcoin and its cryptic brethren.
        </Typography.Paragraph>

        <Typography.Paragraph>
          Reach out to chat more about his projects or for advice on the perfect
          marinara sauce.
        </Typography.Paragraph>
      </>
    }
    background={
      <>
        <Typography.Paragraph>
          Harald’s life-long dedication to coding and his profound knowledge and
          dynamic personality have been invaluable in shaping CoCalc’s
          operations and success.
        </Typography.Paragraph>

        <Typography.Paragraph>
          A software maestro, Harald discovered his passion for coding in his
          teenage years, experimenting with QBasic on the Microsoft Disk
          Operating System and advancing onto Turbo Pascal, Visual Basic, Java,
          and C, among others.
        </Typography.Paragraph>

        <Typography.Paragraph>
          During his studies in Applied Mathematics with a focus on
          Optimization, he deepened his understanding of the intricate workings
          of algorithms. As a result, he embraced Java, Python, and later
          JavaScript as his go-to coding languages. All the while, Harald became
          a key contributor to the SageMath open-source mathematics software – a
          testament to his dedication to broadening the horizons of technology
          and innovation.
        </Typography.Paragraph>

        <Typography.Paragraph>
          Beyond academia, Harald began crafting software solutions for various
          industry needs. After obtaining his Master’s degree, he embarked on a
          Ph.D. journey at the University of Vienna while teaching Linux system
          administration and introducing Python to the undergraduates. Fueled by
          his passion for industry-relevant solutions, he soon founded his own
          company.
        </Typography.Paragraph>

        <Typography.Paragraph>
          Fast forward to 2015, Harald became instrumental in CoCalc’s ascent.
          His role demanded in-depth understanding of Software Engineering,
          Linux administration, system monitoring, and oversight of the entire
          Kubernetes cluster. Harald’s responsibilities didn’t just stop there:
          he managed a towering stack of pre-installed open-source software
          across all CoCalc projects – a role he fulfills with gusto.
        </Typography.Paragraph>
      </>
    }
    pastExperience={[
      {
        institution: "Self-Employed",
        position: "IT Consultant",
        timeframe: "2015-present",
      },
      {
        institution: "Sage Open-Source Mathematical Software System",
        position: "Developer",
        timeframe: "2007-present",
      },
      {
        institution: "University of Vienna",
        position: "Mathematician, Faculty of Mathematics",
        timeframe: "2006-2014",
      },
      {
        institution: "DAGOPT Optimization Technologies GmbH",
        position: "Research and Development",
        timeframe: "2011-2012",
      },
      {
        institution: "University of Vienna",
        position: "Mag. rer. nat. Mathematics",
        timeframe: "1999-2012",
      },
      {
        institution: "University of Vienna",
        position: "M.S. Mathematics",
        timeframe: "1999-2008",
      },
    ]}
  />;
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
