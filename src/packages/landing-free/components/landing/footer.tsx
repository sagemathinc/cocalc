import styles from "styles/Home.module.css";
import Link from "components/misc/link";
import Logo from "./logo-rectangular";

interface Props {
  siteName?: string;
  organizationName?: string;
  termsOfServiceURL?: string;
  contactEmail?: string;
}

function Item({ first, children }) {
  if (first) return children;
  return (
    <>
      &nbsp;{" – "}&nbsp;{children}
    </>
  );
}

export default function Footer(props: Props) {
  return (
    <footer className={styles.footer}>
      <div>
        {props.siteName ?? <Item first>CoCalc</Item>}
        <Item>
          <Link href="https://cocalc.com">CoCalc</Link>
        </Item>
        {props.organizationName && <Item>{props.organizationName}</Item>}
        {props.termsOfServiceURL && (
          <Item>
            {" "}
            <Link href={props.termsOfServiceURL}>Terms of Service</Link>
          </Item>
        )}
        {props.contactEmail && (
          <Item>
            <Link href={"mailto:" + props.contactEmail}>
              Contact {props.contactEmail}
            </Link>
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
