import {
  deleteManagedUserApi,
  disableManagedUserApi,
  enableManagedUserApi,
  getManagedUserApi,
  getManagedUserPasswordApi,
  listManagedUsersApi,
  promoteManagedUserApi,
  resetManagedUserPasswordApi
} from "../../api/settings";

export type { ManagedUserDocView, ManagedUserView } from "../../api/settings";

export const userApi = {
  list: listManagedUsersApi,
  detail: getManagedUserApi,
  promote: promoteManagedUserApi,
  disable: disableManagedUserApi,
  enable: enableManagedUserApi,
  delete: deleteManagedUserApi,
  password: getManagedUserPasswordApi,
  resetPassword: resetManagedUserPasswordApi
};
