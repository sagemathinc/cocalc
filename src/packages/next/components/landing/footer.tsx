import A from "components/misc/A";
import Logo from "components/logo-rectangular";
import { Layout } from "antd";
import { useCustomize } from "lib/customize";
import Contact from "./contact";

function Item({
  first,
  children,
}: {
  first?: boolean;
  children: string | JSX.Element;
}) {
  if (first) return <>{children}</>;
  return (
    <>
      &nbsp;{" – "}&nbsp;{children}
    </>
  );
}

export default function Footer() {
  const {
    siteName,
    organizationName,
    termsOfServiceURL,
    contactEmail,
    landingPages,
  } = useCustomize();
  return (
    <Layout.Footer
      style={{
        textAlign: "center",
        borderTop: "1px solid lightgrey",
        backgroundColor: "white",
      }}
    >
      <div>
        {siteName ?? <Item first>CoCalc</Item>}
        <Item>
          <A href="https://cocalc.com">CoCalc</A>
        </Item>
        {organizationName && <Item>{organizationName}</Item>}
        {!landingPages && termsOfServiceURL && (
          <Item>
            <A href={termsOfServiceURL}>Terms of Service</A>
          </Item>
        )}
        {contactEmail && (
          <Item>
            <Contact />
          </Item>
        )}
      </div>
      <br />
      <div>
        <Logo style={{ height: "40px", width: "40px" }} />
      </div>
    </Layout.Footer>
  );
}
