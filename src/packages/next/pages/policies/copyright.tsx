import Footer from "components/landing/footer";
import Header from "components/landing/header";
import Head from "components/landing/head";
import { Layout } from "antd";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/customize";
import A from "components/misc/A";
import { MAX_WIDTH } from "lib/config";

export default function Copyright({ customize }) {
  return (
    <Customize value={customize}>
      <Head title="Copyright Policy" />
      <Header page="policies" subPage="copyright" />
      <Layout.Content
        style={{
          backgroundColor: "white",
        }}
      >
        <div
          style={{
            maxWidth: MAX_WIDTH,
            margin: "15px auto",
            padding: "15px",
            backgroundColor: "white",
          }}
        >
          <div style={{ textAlign: "center", color: "#444" }}>
            <h1 style={{ fontSize: "28pt" }}>CoCalc - Copyright Policy</h1>
            <h2>Last Updated: April 2, 2015</h2>
          </div>
          <div style={{ fontSize: "12pt" }}>
            <h1>Notification of Copyright Infringement</h1>
            <p>
              SageMath, Inc. ("SageMath") respects the intellectual property
              rights of others and expects its users to do the same.{" "}
            </p>
            <p>
              It is SageMath's policy, in appropriate circumstances and at its
              discretion, to disable and/or terminate the accounts of users who
              repeatedly infringe the copyrights of others.{" "}
            </p>
            <p>
              In accordance with the Digital Millennium Copyright Act of 1998,
              the text of which may be found on the U.S. Copyright Office
              website at{" "}
              <A href="http://www.copyright.gov/legislation/dmca.pdf">
                http://www.copyright.gov/legislation/dmca.pdf
              </A>
              , SageMath will respond expeditiously to claims of copyright
              infringement committed using the SageMath website(s) (the "Sites")
              that are reported to SageMath's Designated Copyright Agent,
              identified in the sample notice below.{" "}
            </p>
            <p>
              If you are a copyright owner, or are authorized to act on behalf
              of one, or authorized to act under any exclusive right under
              copyright, please report alleged copyright infringements taking
              place on or through the Sites by completing the following DMCA
              Notice of Alleged Infringement and delivering it to SageMath's
              Designated Copyright Agent. Upon receipt of the Notice as
              described below, SageMath will take whatever action, in its sole
              discretion, it deems appropriate, including removal of the
              challenged material from the Sites.{" "}
            </p>
            <h1>DMCA Notice of Alleged Infringement ("Notice")</h1>
            <p></p>
            <ol>
              <li>
                Identify the copyrighted work that you claim has been infringed,
                or--if multiple copyrighted works are covered by this
                Notice--you may provide a representative list of the copyrighted
                works that you claim have been infringed.
              </li>
              <li>
                Identify the material that you claim is infringing (or to be the
                subject of infringing activity) and that is to be removed or
                access to which is to be disabled, and information reasonably
                sufficient to permit us to locate the material, including at a
                minimum, if applicable, the URL of the link shown on the Site(s)
                where such material may be found.
              </li>
              <li>
                Provide your mailing address, telephone number, and, if
                available, email address.{" "}
              </li>
              <li>
                Include both of the following statements in the body of the
                Notice:
                <ul>
                  <li>
                    "I hereby state that I have a good faith belief that the
                    disputed use of the copyrighted material is not authorized
                    by the copyright owner, its agent, or the law (e.g., as a
                    fair use)."
                  </li>
                  <li>
                    "I hereby state that the information in this Notice is
                    accurate and, under penalty of perjury, that I am the owner,
                    or authorized to act on behalf of the owner, of the
                    copyright or of an exclusive right under the copyright that
                    is allegedly infringed."
                  </li>
                </ul>
              </li>
              <li>
                Provide your full legal name and your electronic or physical
                signature.{" "}
              </li>
            </ol>
            <p></p>Deliver this Notice, with all items completed, to SageMath,
            Inc.'s Designated Copyright Agent via email to{" "}
            <A href="mailto:copyright@sagemath.com">copyright@sagemath.com</A>{" "}
            or physical letter to:
            <br />
            <br />
            <p>
              William Stein (Copyright Agent)
              <br /> c/o SageMath, Inc.
              <br /> 17725 SE 123RD PL
              <br /> Renton, WA 98059-6621
              <br /> USA
              <br />{" "}
              <A href="mailto:copyright@sagemath.com">copyright@sagemath.com</A>
            </p>
          </div>
        </div>
        <Footer />
      </Layout.Content>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  return await withCustomize({ context });
}
