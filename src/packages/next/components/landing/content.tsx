/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Row, Col } from "antd";
import { ReactNode } from "react";
import SignIn from "components/landing/sign-in";
import SanitizedMarkdown from "components/misc/sanitized-markdown";
import Image from "./image";

// See https://github.com/vercel/next.js/issues/29788 for why we have to define this for now (it's to work around a bug).
interface StaticImageData {
  src: string;
  height: number;
  width: number;
  blurDataURL?: string;
}

interface Props {
  title: ReactNode;
  subtitle: ReactNode;
  description?: ReactNode;
  logo?: ReactNode | string | StaticImageData;
  image?: string | StaticImageData;
  alt?: string;
  startup?: ReactNode;
  caption?: string;
  indexInfo?: string;
}

function Logo({ logo, title }) {
  if (!logo) return null;
  if (typeof logo == "string" || logo?.src != null) {
    return (
      <Image src={logo} style={{ width: "200px" }} alt={`${title} logo`} />
    );
  }
  return logo;
}

export default function Content({
  title,
  subtitle,
  description,
  logo,
  image,
  alt,
  startup,
  caption,
  indexInfo,
}: Props) {
  function renderIndexInfo() {
    if (!indexInfo) return;

    return (
      <>
        <Col
          xs={24}
          style={{
            borderTop: "1px solid lightgrey",
            marginTop: "20px",
            marginBottom: "20px",
          }}
        ></Col>
        <Col sm={{ span: 12, offset: 6 }} xs={{ span: 24, offset: 0 }}>
          <SanitizedMarkdown value={indexInfo} />
        </Col>
      </>
    );
  }

  return (
    <div style={{ padding: "30px 0" }}>
      <Row>
        <Col
          sm={10}
          xs={24}
          style={{
            display: "flex",
            alignItems: "center",
            paddingTop: "15px",
          }}
        >
          <div
            style={{ textAlign: "center", margin: "auto", padding: "0 10%" }}
          >
            <Logo logo={logo} title={title} />
            <br />
            <br />

            <h1 style={{ color: "#333" }}>{title}</h1>
            <h2 style={{ color: "#333" }}>{subtitle}</h2>
            <h3 style={{ color: "#666" }}>{description}</h3>
          </div>
        </Col>
        <Col sm={14} xs={24}>
          {image && (
            <>
              <Image
                src={image}
                priority={true}
                style={{ padding: "15px" }}
                alt={alt ?? `Image illustrating ${title}`}
              />
              <div
                style={{ textAlign: "center", color: "#333", fontSize: "12pt" }}
              >
                {caption}
              </div>
            </>
          )}
        </Col>
        {renderIndexInfo()}
      </Row>
      <SignIn startup={startup ?? title} hideFree={true} />
    </div>
  );
}
