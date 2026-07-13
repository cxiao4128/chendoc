/**
 * Settings module public API
 *
 * Cross-module exports for settings sub-domains:
 * - core: basic key-value store
 * - site: site configuration
 * - storage: R2 storage configuration
 * - users: user management
 * - logs: operation logs
 * - maintenance: system status and maintenance actions
 */

// Core
export { setSetting, setSettings, listSettings } from "./core.service.js";
export type { SettingRow, SettingType } from "./types.js";

// Site
export { getSiteConfig, saveSiteConfig } from "./site.service.js";

// Storage
export { getR2Config, saveR2Config, testR2Connection, assertR2Ready } from "./storage.service.js";
export { r2ConfigSchema } from "./storage.repo.js";

// Users
export {
  listManagedUsers,
  getManagedUser,
  promoteManagedUser,
  disableManagedUser,
  enableManagedUser,
  deleteManagedUser,
  getManagedUserPasswordView,
  resetManagedUserPassword
} from "./users.service.js";

// Logs
export { listOperationLogs } from "./logs.service.js";

// Maintenance
export { getSystemOverview, runSystemMaintenanceAction, exportSystemConfig } from "./maintenance.service.js";
