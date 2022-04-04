/* Show all our icons.

See frontend/components/iconfont.cn/README.md for how to add anything from
the massive https://www.iconfont.cn/?lang=us
*/

import IconSelect from "@cocalc/frontend/components/icon-select";
import Head from "components/landing/head";

export default function Icons() {
  return (
    <div style={{ margin: "60px" }}>
      <Head title={"CoCalc Icons"} />
      <h1>CoCalc Icons</h1>
      <IconSelect />
    </div>
  );
}
