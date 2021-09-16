import Link from "next/link";
import SquareLogo from "components/logo-square";
import A from "components/misc/A";
import { join } from "path";
import { Layout } from "antd";
import useCustomize from "lib/use-customize";
import basePath from "lib/base-path";
import LandingHeader from "components/landing/header";

export default function Header() {
  return <LandingHeader page="share" />;
}
