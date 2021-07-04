import styles from "styles/Home.module.css";
import A from "components/misc/A";
import Logo from "./logo-rectangular";
import customize from "lib/customize";

function Item({ first, children }) {
  if (first) return children;
  return (
    <>
      &nbsp;{" – "}&nbsp;{children}
    </>
  );
}

export default function Footer() {
  const { siteName, organizationName, termsOfServiceURL, contactEmail } =
    customize;
  return (
    <footer className={styles.footer}>
      <div>
        {siteName ?? <Item first>CoCalc</Item>}
        <Item>
          <A href="https://cocalc.com">CoCalc</A>
        </Item>
        {organizationName && <Item>{organizationName}</Item>}
        {termsOfServiceURL && (
          <Item>
            {" "}
            <A href={termsOfServiceURL}>Terms of Service</A>
          </Item>
        )}
        {contactEmail && (
          <Item>
            <A href={"mailto:" + contactEmail}>Contact {contactEmail}</A>
          </Item>
        )}
      </div>
      <br />
      <div>
        <Logo style={{ height: "24px" }} />
      </div>
    </footer>
  );
}
