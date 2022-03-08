export interface Profile {
  account_id: string;
  first_name: string;
  last_name: string;
  color?: string;
  image?: string;
  name?: string;
  is_admin?: boolean;
  is_anonymous?: boolean;
}
