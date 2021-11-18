import NextHead from "next/head";
import { useCustomize } from "lib/customize";
import { ReactNode } from "react";
import basePath from "lib/base-path";
const FAVICON = "/webapp/favicon-32x32.png";
import { join } from "path";

interface Props {
  title: ReactNode;
}

export default function Head({ title }: Props) {
  const { siteName } = useCustomize();
  return (
    <NextHead>
      <title>
        {siteName} – {title}
      </title>
      <meta
        name="description"
        content="CoCalc landing pages and documentation"
      />
      <link rel="icon" href={join(basePath ?? "", FAVICON)} />
    </NextHead>
  );
}
