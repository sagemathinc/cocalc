import A from "components/misc/A";
import useCustomize from "lib/use-customize";

export default function Overview() {
  const { isCommercial } = useCustomize();
  return (
    <div>
      <p>
        You can{" "}
        {isCommercial && (
          <>
            <A href="/store/site-license">buy a site license</A>,
          </>
        )}{" "}
        see the <A href="/licenses/managed">licenses you manage</A>, browse the{" "}
        <A href="/licenses/projects">licensed projects you collaborate on</A>,
        and see how{" "}
        <A href="/licenses/how-used">a specific site licenses is being used</A>.{" "}
      </p>
      <p>
        Read{" "}
        <A href="https://doc.cocalc.com/licenses.html">
          the license documentation
        </A>
        .
      </p>
    </div>
  );
}
