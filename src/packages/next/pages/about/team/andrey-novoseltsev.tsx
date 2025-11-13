import { Typography } from "antd";

import { TeamBio } from "components/about/team";
import withCustomize from "lib/with-customize";

import AndreyNovoseltsevImage from "public/about/andrey-novoseltsev.jpeg";

export default function AndreyNovoseltsev({ customize }) {
  return <TeamBio
    customize={customize}
    givenName="Andrey"
    surname="Novoseltsev"
    position="Chief Operations Officer at SageMath, Inc. "
    positionShort="COO"
    positionTimeframe="2023-present"
    image={AndreyNovoseltsevImage}
    imageAlt={"A portrait of Andrey smiling."}
    companyRole={
      <Typography.Paragraph>
        As Chief Operating Officer, Andrey keeps a keen eye on financial aspects
        of the company to ensure everything is in order while looking for
        insights to drive the company’s growth. If you need custom quotes and
        special care for your purchasing orders and invoices, Andrey is always
        happy to help you!
      </Typography.Paragraph>
    }
    personalSection={
      <Typography.Paragraph>
        Apart from his efforts in SageMath, Inc. Andrey is a dedicated father of
        two adorable daughters and strives to instill in them love for hiking in
        the mountains (and perhaps even backpacking!). He enjoys learning about
        global geopolitical perspectives and taking into account wood grain
        irregularities using hand tools.
      </Typography.Paragraph>
    }
    background={
      <>
        <Typography.Paragraph>
          Andrey went through graduate school as a student and then an
          instructor in Russia, USA, and Canada. With an interest in software
          development starting with early childhood experience on Soviet ES EVM,
          he used SageMath extensively both in his Ph.D. research and teaching.
        </Typography.Paragraph>

        <Typography.Paragraph>
          Together with Volker Braun (long term release manager of SageMath),
          Andrey has implemented a framework for computations with toric
          varieties and Calabi-Yau varieties in them, fixing various bugs and
          making improvements in other areas of SageMath along the way.
        </Typography.Paragraph>

        <Typography.Paragraph>
          Andrey was one of the early adopters of SageMathCell and its
          interacts, writing many of them for courses on differential equations
          and multivariate calculus. He set up dedicated servers for his classes
          and when the original lead of SageMathCell (Jason Grout) was switching
          to other endeavours, it was natural for Andrey to pick up the project.
        </Typography.Paragraph>

        <Typography.Paragraph>
          As another direction of integrating SageMath into teaching, Andrey has
          developed a module for interactive learning of intricacies of the
          simplex method in optimization, which eventually grew into supporting
          group homework assignments and exams for that course. That experience
          was instrumental in understanding the importance of tools like CoCalc
          to smoothly support instructors in using Python notebooks for
          teaching.
        </Typography.Paragraph>
      </>
    }
    pastExperience={[
      {
        institution: "Self-Employed",
        position: "Insurance Agent",
        timeframe: "2019-present",
      },
      {
        institution: "SageMath",
        position: "SageMathCell Maintainer and Lead Developer",
        timeframe: "2014-present",
      },
      {
        institution: "SageMath",
        position: "Developer",
        timeframe: "2006-present",
      },
      {
        institution: "University of Alberta",
        position: "Postdoc",
        timeframe: "2011-2016",
      },
      {
        institution: "University of Alberta",
        position: "Ph.D. in Mathematics",
        timeframe: "2011",
      },
    ]}
  />;
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
