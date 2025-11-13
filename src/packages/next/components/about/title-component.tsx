import { Flex, Typography } from "antd";
import { TitleProps } from "antd/es/typography/Title";

import { COLORS } from "@cocalc/util/theme";

export interface TitleComponentProps {
  name: string;
  jobTitle?: string;
  level?: TitleProps['level'];
}

export const TitleComponent = (
  {
    name,
    jobTitle,
    level = 3,
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
