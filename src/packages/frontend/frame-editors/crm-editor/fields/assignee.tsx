import { render } from "./register";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";
import { AVATAR_SIZE } from "./accounts";

render({ type: "assignee" }, ({ field, obj, spec, viewOnly }) => {
  if (spec.type != "assignee") throw Error("bug");
  const account_id = obj[field];
  if (!account_id && viewOnly) return null;
  if (!viewOnly && spec.editable) {
    return <EditAssignee obj={obj} field={field} account_id={account_id} />;
  } else {
    return (
      <div>
        <Avatar key={account_id} account_id={account_id} size={AVATAR_SIZE} />
      </div>
    );
  }
});

function EditAssignee() {
  return <div>edit</div>;
}
