import Link from "next/link";
import Info from "./info";

export default function Publishing() {
  return (
    <Info
      anchor="a-publishing"
      title="Publishing"
      icon="bullhorn"
      image="cocalc-share-latex-document.png"
      alt="Viewing a PDF file in the share server"
    >
      <p>
        CoCalc helps you <strong>sharing your work with the world</strong>. It
        offers its own hosting of{" "}
        <Link href="/share">
          <a>shared documents</a>
        </Link>
        , alongside with any associated data files.
      </p>
      <p>
        You can configure if your published files should be listed publicly, or
        rather only be available via a confidential URL.{" "}
      </p>
    </Info>
  );
}
