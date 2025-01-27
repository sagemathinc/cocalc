export interface Purchases {
  getBalance: ({ account_id }) => Promise<number>;
  getMinBalance: (account_id) => Promise<number>;
}

export const purchases = {
  getBalance: ({ account_id }) => {
    return [{ account_id }];
  },
  getMinBalance: ({ account_id }) => [account_id],
};
