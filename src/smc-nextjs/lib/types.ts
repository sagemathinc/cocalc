export interface User {
  account_id: string;
  first_name: string;
  last_name: string;
}

// This is because of Type error: 'types.ts' cannot be compiled under '--isolatedModules' because it is considered a
// global script file. Add an import, export, or an empty 'export {}' statement to make it a module.
export default {}