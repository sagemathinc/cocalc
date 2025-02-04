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

// make no changes, except throw error if account_id not set (i.e., user not signed in)
export const requireAccount = ({ args, account_id }) => {
  if (!account_id) {
    throw Error("user must be signed in");
  }
  return args;
};

export const authFirstRequireAccount = async ({ args, account_id }) => {
  if (args[0] == null) {
    args[0] = {} as any;
  }
  if (!account_id) {
    throw Error("user must be signed in");
  }
  args[0].account_id = account_id;
  return args;
};

