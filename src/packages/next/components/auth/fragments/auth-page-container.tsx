/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { ReactNode } from "react";
import { Alert } from "antd";

import { COLORS } from "@cocalc/util/theme";
import Logo from "components/logo";

import { BODY_STYLE, LOGIN_STYLE, AUTH_WRAPPER_STYLE } from "../shared";


interface AuthPageContainerProps {
  children: ReactNode;
  error?: ReactNode;
  footer?: ReactNode;
  minimal?: boolean;
  subtitle?: ReactNode;
  title: string;
}

export default function AuthPageContainer(props: AuthPageContainerProps) {
  const {
    children,
    error ,
    footer,
    minimal = false,
    subtitle,
    title,
  } = props;

  return (
    <div style={BODY_STYLE}>
      <div style={AUTH_WRAPPER_STYLE}>
        {!minimal && (
          <div style={{
            textAlign: "center",
            marginBottom: "15px",
            color: COLORS.GRAY_D,
          }}>
            <Logo
              type="icon"
              style={{ width: "100px", height: "100px", marginBottom: "15px" }}
              priority={true}
            />
            <h2>{title}</h2>
            {subtitle}
          </div>
        )}

        <div style={LOGIN_STYLE}>
          {children}
        </div>

        {error && (
          <>
            <Alert
              style={{ marginTop: "20px" }}
              message="Error"
              description={error}
              type="error"
              showIcon
            />
          </>
        )}

        {footer && (
          <div style={{
              margin: `${ BODY_STYLE.margin } auto`,
              padding: "8px",
          }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
