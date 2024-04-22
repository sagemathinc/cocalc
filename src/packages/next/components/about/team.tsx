import { Flex, List, Typography } from "antd";

import { COLORS } from "@cocalc/util/theme";
import { TitleProps } from "antd/es/typography/Title";

export interface TitleComponentProps {
  name: string;
  jobTitle?: string;
  level?: TitleProps['level'];
}

export const TitleComponent = (
  {
    name,
    jobTitle,
    level=3,
  }: TitleComponentProps
) => (
  <Flex
    justify="space-between"
    align="baseline"
    wrap="wrap"
    style={{
      marginBottom: "24px"
    }}>
    <Typography.Title
      style={{
        margin: 0,
      }}
      level={level}
    >{name}</Typography.Title>
    {jobTitle && (
      <Typography.Title
        style={{
          margin: 0,
          color: COLORS.GRAY,
        }}
        level={level}
      >{jobTitle}</Typography.Title>
    )}
  </Flex>
);

export interface ExperienceComponentProps {
  experiences: Array<{
    institution: string;
    position: string;
    timeframe?: string;
  }>;
};

export const ExperienceComponent = (
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
