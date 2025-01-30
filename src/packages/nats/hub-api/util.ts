export const authFirst = ({ args, account_id, project_id }) => {
  if (args[0] == null) {
    args[0] = {} as any;
  }
  if (account_id) {
    args[0].account_id = account_id;
  } else if (project_id) {
    args[0].project_id = project_id;
  }
  return args;
};

export const noAuth = ({ args }) => args;
