/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSS, React, useTypedRedux } from "../app-framework";
import { by_lowercase } from "./utils";
import { Row, Col } from "../antd-bootstrap";

const STYLE = { maxHeight: "12rem", overflowY: "auto", fontSize: "80%" } as CSS;

interface Props {
  lang: string;
}

export const Executables: React.FC<Props> = ({ lang }) => {
  const inventory = useTypedRedux("compute-environment", "inventory")?.get(
    lang
  );
  const components = useTypedRedux("compute-environment", "components")?.get(
    lang
  );
  if (inventory == null || components == null) return <></>;

  const [...execs] = inventory.keys();
  function name(x: string): string {
    const y = components?.get(x) ?? "";
    return typeof y == "string" ? y : y.get("name") ?? "";
  }
  execs.sort((a, b) => by_lowercase(name(a), name(b)));

  const v: JSX.Element[] = [];
  for (const exec of execs) {
    const stdout = inventory.get(exec);
    if (stdout == null) continue; // should not happen
    v.push(
      <Row key={exec} style={{ margin: "2rem 0 2rem 0" }}>
        <Col md={3}>
          <b>{name(exec)}</b>
          <br />
          <code style={{ fontSize: "80%" }}>{exec}</code>
        </Col>
        <Col md={9}>
          <pre style={STYLE}>{stdout}</pre>
        </Col>
      </Row>
    );
  }
  return <>{v}</>;
};
