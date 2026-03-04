declare const User: any;
export default User;

export type User = {
  id?: string;
  username: string;
  email: string;
  password?: string;
  [key: string]: any;
};
