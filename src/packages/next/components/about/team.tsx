import { ReactNode } from "react";

import { Card, Col, Layout, List, Row, Space, Typography } from "antd";

import { COLORS } from "@cocalc/util/theme";

import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import Image, { StaticImageData } from "components/landing/image";

import { MAX_WIDTH } from "lib/config";
import { Customize, CustomizeType } from "lib/customize";

import { TitleComponent } from "./title-component";

interface ExperienceComponentProps {
  experiences: Array<{
    institution: string;
    position: string;
    timeframe?: string;
  }>;
};

const ExperienceComponent = (
  { experiences }: ExperienceComponentProps
) => (
  <List
    size="small"
    dataSource={experiences}
    renderItem={(item) => (
      <List.Item>
        <List.Item.Meta
          title={
            <>
              <Typography.Text>{item.institution}</Typography.Text>
              {item.timeframe && (
                <span style={{color: COLORS.GRAY }}> &middot; {item.timeframe} </span>
              )}
            </>
          }
          description={
            <>
              <em>{item.position}</em>
            </>
          }
        />
      </List.Item>
    )}
  />
);

export interface TeamBioProps {
  customize: CustomizeType;
  givenName: string;
  surname: string;
  position: string;
  positionShort: string;
  positionTimeframe: string;
  image?: string | StaticImageData;
  imageAlt?: string;
  background: ReactNode;
  companyRole: ReactNode;
  personalSection: ReactNode;
  pastExperience: ExperienceComponentProps['experiences'];
}

export const TeamBio = (props: TeamBioProps) => {
  const fullName = `${props.givenName} ${props.surname}`;

  return (
    <Customize value={props.customize}>
    <Head title={`Team - ${fullName}`}/>
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
          <Space direction="vertical" size="middle">
            <TitleComponent name={`Meet ${fullName}.`} level={2}/>

            <Row wrap gutter={24}>
              <Col xs={24} md={12}>
                <Card
                  style={{
                    maxWidth: "512px"
                  }}
                  cover={props.image && (
                    <Image
                      src={props.image}
                      alt={props.imageAlt || fullName}
                    />
                  )}
                >
                  <Card.Meta
                    title={`${fullName}, ${props.positionShort}`}
                    description={props.positionTimeframe}
                  />
                </Card>
              </Col>
              <Col xs={24} md={12}>
                <Typography.Title level={5}>
                  {props.position}
                </Typography.Title>

                {props.companyRole}

                {props.personalSection}
              </Col>
            </Row>

            <Typography.Title level={4}>Background</Typography.Title>
            {props.background}

            <Typography.Title level={4}>Previous Experience</Typography.Title>
            <ExperienceComponent experiences={props.pastExperience} />
          </Space>
        </div>
        <Footer/>
      </Layout.Content>
    </Layout>
  </Customize>
  )
}
