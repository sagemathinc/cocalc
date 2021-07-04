import styles from "styles/Home.module.css";
import Link from "components/misc/link";
import Logo from "./logo-rectangular";

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
    JSON.parse(process.env.CUSTOMIZE);
  return (
    <footer className={styles.footer}>
      <div>
        {siteName ?? <Item first>CoCalc</Item>}
        <Item>
          <Link href="https://cocalc.com">CoCalc</Link>
        </Item>
        {organizationName && <Item>{organizationName}</Item>}
        {termsOfServiceURL && (
          <Item>
            {" "}
            <Link href={termsOfServiceURL}>Terms of Service</Link>
          </Item>
        )}
        {contactEmail && (
          <Item>
            <Link href={"mailto:" + contactEmail}>Contact {contactEmail}</Link>
          </Item>
        )}
      </div>
      <br />
      <div>
        <Logo style={{ height: "1.5em" }} />
      </div>
    </footer>
  );
}
