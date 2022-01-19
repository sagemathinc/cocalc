import A from "components/misc/A";
import SiteName from "components/share/site-name";

export default function Overview() {
  return (
    <div>
      <h3>
        Welcome to the <SiteName /> Store!
      </h3>
      <p>
        You can <A href="/store/site-license">purchase a site license</A>, view
        your <A href="/store/cart">shopping cart</A>, or{" "}
        <A href="/store/checkout">checkout</A>.
      </p>

      <p>
        You can also browse your <A href="/billing">billing records</A> or{" "}
        <A href="/licenses">licenses</A>.
      </p>
    </div>
  );
}
