import { ReactNode, CSSProperties } from "react";
import { Typography } from "antd";
const { Text } = Typography;

interface Props {
  children: ReactNode;
  style?: CSSProperties;
}

export default function Code({ children, style }: Props) {
  return (
    <Text code style={style}>
      {children}
    </Text>
  );
}
