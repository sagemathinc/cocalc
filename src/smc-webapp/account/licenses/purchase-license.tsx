import { React, useState } from "../../app-framework";
import { PurchaseOneLicense } from "../../site-licenses/purchase";

export const PurchaseLicense: React.FC = () => {
  const [show, set_show] = useState<boolean>(false);
  return (
    <div>
      <h3>
        <a
          onClick={() => {
            set_show(!show);
          }}
        >
          Purchase license{show ? "" : "..."}
        </a>
      </h3>
      {show && <PurchaseOneLicense />}
    </div>
  );
};
