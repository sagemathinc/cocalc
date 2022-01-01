import A from "components/misc/A";

export default function Overview() {
  return (
    <div>
      <p>
        You can <A href="/licenses/create">create a new license</A>, see the{" "}
        <A href="/licenses/managed">licenses you manage</A>, browse the{" "}
        <A href="/licenses/projects">licensed projects you collaborate on</A>,
        and see how{" "}
        <A href="/licenses/how-used">a specific licenses is being used</A>.{" "}
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
