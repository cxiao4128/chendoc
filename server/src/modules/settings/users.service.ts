// Users management service

import { dbTransaction } from "../../db/client.js";
import { deleteUserSessions } from "./users.repo.js";
import { hashPassword, validatePassword } from "../../utils/password.js";
import { isSuperAdminUser } from "../../utils/superAdmin.js";
import { clearLoginFailuresForUsername } from "../auth/loginRisk.service.js";
import { now } from "../../utils/date.js";
import type { ManagedUser, UserActor } from "./types.js";
import {
  getUserDocStatsMap,
  getRecentActivityMap,
  listManagedUsers as listManagedUsersFromRepo,
  listUserDocs,
  listUserLogs,
  reassignUserDocs,
  clearCreatedBy,
  clearUpdatedBy,
  clearInviteCreatedBy,
  clearInviteUsedBy,
  reassignSpacesOwner,
  reassignFormsOwner,
  clearSharesRequestedBy,
  clearSharesReviewedBy,
  reassignUploadsOwner,
  clearDocVersionsCreatedBy,
  clearOperationLogsUserId,
  clearLogsUserId,
  reassignUserTags,
  reassignUserTemplates,
  deleteUserPrivateData,
  getManagedUserRecord,
  hardDeleteUser,
  updateUserRole,
  updateUserStatus,
  updateUserPassword,
  countActiveAdmins,
} from "./users.repo.js";

async function getManagedUserRecordLocal(id: number): Promise<ManagedUser> {
  const user = await getManagedUserRecord(id);
  if (!user) throw new Error("用户不存在");
  return user as ManagedUser;
}

async function activeAdminCount(): Promise<number> {
  return countActiveAdmins();
}

function assertCanManageAdminUser(_target: ManagedUser, actor: UserActor): void {
  if (!actor.isSuperAdmin) throw new Error("只有超级管理员可以管理用户账号");
}

function assertCanPromoteUser(target: ManagedUser, actor: UserActor): void {
  if (!actor.isSuperAdmin) throw new Error("只有超级管理员可以提级用户");
  if (target.role === "admin") throw new Error("该用户已经是管理员");
}

async function assertCanDisableOrDeleteUser(target: ManagedUser, actor: UserActor): Promise<void> {
  if (target.id === actor.id) throw new Error("不能操作当前登录账号");
  assertCanManageAdminUser(target, actor);
  if (target.role === "admin" && target.status === "active" && (await activeAdminCount()) <= 1) {
    throw new Error("至少保留一个启用的管理员");
  }
}

async function recentUserActivity(userId: number) {
  const rows = await listUserLogs(userId, 80);
  const recentIps = Array.from(new Set(rows.map((row) => row.ip).filter((ip): ip is string => !!ip))).slice(0, 8);
  return {
    lastIp: recentIps[0] ?? null,
    lastActiveAt: rows[0]?.createdAt ?? null,
    recentIps
  };
}

async function userDocStats(userId: number) {
  const statsMap = await getUserDocStatsMap([userId]);
  const stats = statsMap.get(userId) ?? { docCount: 0, deletedDocCount: 0 };
  return {
    docCount: stats.docCount,
    deletedDocCount: stats.deletedDocCount
  };
}

async function managedUserPayload(user: ManagedUser, includeDocs = false) {
  const docStats = await userDocStats(user.id);
  const activity = await recentUserActivity(user.id);
  const userDocs = includeDocs
    ? await listUserDocs(user.id, 80)
    : undefined;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isSuperAdmin: isSuperAdminUser(user),
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...docStats,
    ...activity,
    ...(userDocs ? { docs: userDocs } : {})
  };
}

export async function listManagedUsers() {
  const rows = await listManagedUsersFromRepo();
  const userIds = rows.map((user) => user.id);
  const [docStats, activity] = await Promise.all([getUserDocStatsMap(userIds), getRecentActivityMap(userIds)]);
  return rows.map((user) => ({
    id: user.id,
    username: user.username,
    role: user.role,
    isSuperAdmin: isSuperAdminUser(user),
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    ...(docStats.get(user.id) ?? { docCount: 0, deletedDocCount: 0 }),
    ...(activity.get(user.id) ?? { lastIp: null, lastActiveAt: null, recentIps: [] })
  }));
}

export async function getManagedUser(id: number) {
  return managedUserPayload(await getManagedUserRecordLocal(id), true);
}

export async function promoteManagedUser(id: number, actor: UserActor) {
  const user = await getManagedUserRecordLocal(id);
  assertCanPromoteUser(user, actor);
  await dbTransaction(async (tx) => {
    await updateUserRole(id, "admin", tx);
    await updateUserStatus(id, "active", tx);
    await deleteUserSessions(id, tx);
  });
  return getManagedUser(id);
}

export async function disableManagedUser(id: number, actor: UserActor) {
  const user = await getManagedUserRecordLocal(id);
  await assertCanDisableOrDeleteUser(user, actor);
  await dbTransaction(async (tx) => {
    await updateUserStatus(id, "disabled", tx);
    await deleteUserSessions(id, tx);
  });
  return getManagedUser(id);
}

export async function enableManagedUser(id: number, actor: UserActor) {
  const user = await getManagedUserRecordLocal(id);
  assertCanManageAdminUser(user, actor);
  await updateUserStatus(id, "active");
  return getManagedUser(id);
}

export async function deleteManagedUser(id: number, actor: UserActor) {
  const user = await getManagedUserRecordLocal(id);
  await assertCanDisableOrDeleteUser(user, actor);
  const actorId = actor.id;
  const updatedAt = now();
  await dbTransaction(async (tx) => {
    await deleteUserSessions(id, tx);
    await clearOperationLogsUserId(id, tx);
    await clearLogsUserId(id, tx);
    await reassignUserDocs(id, actorId, tx);
    await clearCreatedBy(id, tx);
    await clearUpdatedBy(id, tx);
    await clearInviteCreatedBy(id, tx);
    await clearInviteUsedBy(id, tx);
    await reassignSpacesOwner(id, actorId, tx);
    await reassignFormsOwner(id, actorId, updatedAt, tx);
    await clearSharesRequestedBy(id, tx);
    await clearSharesReviewedBy(id, tx);
    await reassignUploadsOwner(id, actorId, tx);
    await clearDocVersionsCreatedBy(id, tx);
    await reassignUserTags(id, actorId, tx);
    await reassignUserTemplates(id, actorId, tx);
    await deleteUserPrivateData(id, tx);
    await hardDeleteUser(id, tx);
  });
}

export async function getManagedUserPasswordView(id: number, _actor: UserActor) {
  const user = await getManagedUserRecordLocal(id);
  assertCanManageAdminUser(user, _actor);
  return {
    viewable: false as const,
    message: "密码已加密存储，不能查看明文。请直接重置密码。"
  };
}

export async function resetManagedUserPassword(id: number, password: string, actor: UserActor) {
  const user = await getManagedUserRecordLocal(id);
  assertCanManageAdminUser(user, actor);
  const validationMessage = validatePassword(password);
  if (validationMessage) throw new Error(validationMessage);
  const passwordHash = await hashPassword(password);
  await dbTransaction(async (tx) => {
    await updateUserPassword(id, passwordHash, now(), tx);
    await clearLoginFailuresForUsername(user.username, tx);
    await deleteUserSessions(id, tx);
  });
  return getManagedUser(id);
}
