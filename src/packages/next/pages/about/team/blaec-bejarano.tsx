import { Typography } from "antd";

import { TeamBio } from "components/about/team";
import A from "components/misc/A";

import withCustomize from "lib/with-customize";

import BlaecBejaranoImage from "public/about/blaec-bejarano.png";

export default function BlaecBejarano({ customize }) {
  return <TeamBio
    customize={customize}
    givenName="Blaec"
    surname="Bejarano"
    position="Chief Sales Officer at SageMath, Inc."
    positionShort="CSO"
    positionTimeframe="2022-present"
    image={BlaecBejaranoImage}
    imageAlt={"A portrait of Blaec looking amiable."}
    companyRole={
      <Typography.Paragraph>
        If you would like to discuss computational applied mathematics, software
        development/integration opportunities, or possible partnerships with
        SageMath, don’t hesitate to get in touch with Blaec via email at{" "}
        <A href="mailto:blaec@cocalc.com">blaec@cocalc.com</A>!
      </Typography.Paragraph>
    }
    personalSection={
      <>
        <Typography.Paragraph>
          Blaec is passionate about implementing data-driven decision-making in
          government, industry, and academia and his advocacy exemplifies his
          research interests — applied mathematics and numerical modeling of
          geophysical phenomena.
        </Typography.Paragraph>

        <Typography.Paragraph>
          His dedication to academic communities is evident through his past
          roles, notably as the Student Chapter Secretary of the Society of
          Industrial and Applied Mathematics. Now, it’s hard to even name a
          community he’s not involved in after participating in 30 conferences
          during 2023.
        </Typography.Paragraph>
      </>
    }
    background={
      <>
        <Typography.Paragraph>
          Graduating in 2021 with an M.S. in Mathematics from Oregon State
          University, Blaec’s academic expertise are focused on applying
          numerical analysis and partial differential equations to model
          physical phenomena.
        </Typography.Paragraph>

        <Typography.Paragraph>
          Blaec’s foundation in modern teaching methods - gained through his
          years as a teaching assistant and instructor - complements his current
          role at SageMath, where his responsibilities span from increasing
          CoCalc’s user base through innovative market penetration strategies to
          social media/advertising campaigns. Moreover, Blaec drives
          opportunities for CoCalc by demonstrating the platform’s most recent
          features via live demos at premier conferences like the International
          Congress on Industrial and Applied Mathematics (ICIAM) and the
          International Conference on Machine Learning (ICML).
        </Typography.Paragraph>

        <Typography.Paragraph>
          Beyond academic spheres, Blaec is actively engaged in several industry
          and business societies, including the Seattle Chamber of Commerce, the
          National Small Business Association Leadership Technology Council, and
          open-source technology/startup communities like NumFocus and Startup
          Grind. Blaec directs corporate alliances among his many roles, leading
          the bid to fuse other proprietary software like MATLAB into the
          open-source ecosystem.
        </Typography.Paragraph>

        <Typography.Paragraph>
          Even amidst his busy schedule, Blaec finds time for adventure and
          creativity. Lovingly known as one of the SageMath resident
          mountaineers, Blaec often scales the Cascade volcanoes of the Pacific
          Northwest (and can otherwise be found at home writing songs alongside
          his cat Fushigi).
        </Typography.Paragraph>
      </>
    }
    pastExperience={[
      {
        institution: "Cascade Enrichment",
        position: "Tutor",
        timeframe: "2022",
      },
      {
        institution: "Oregon State University",
        position: "Instructor of Record",
        timeframe: "2019-2021",
      },
      {
        institution: "Oregon State University",
        position: "Graduate Teaching Assistant",
        timeframe: "2018-2021",
      },
      {
        institution: "Oregon State University",
        position: "M.S. Mathematics",
        timeframe: "2018-2021",
      },
      {
        institution: "University of West Florida",
        position: "B.A. History, B.S. Mathematics",
        timeframe: "2013-2017",
      },
    ]}
  />;
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
