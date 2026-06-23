import { eq } from "drizzle-orm";
import { closeDatabase, db, dbGet, dbRun } from "../db/client.js";
import { migrate } from "../db/migrate.js";
import { docs, shares, spaces, users } from "../db/schema.js";
import { env } from "../config/env.js";
import { now } from "../utils/date.js";
import { encryptDocumentContent } from "../utils/documentCrypto.js";
import { generateShareToken } from "../utils/shareToken.js";
import { generateDocUid } from "../utils/docUid.js";
import { hashPassword } from "../utils/password.js";

function flagEnabled(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

async function createUniqueDocUid() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const docUid = generateDocUid();
    const existing = await dbGet<{ id: number }>(db.select({ id: docs.id }).from(docs).where(eq(docs.docUid, docUid)).limit(1));
    if (!existing) return docUid;
  }
  throw new Error("doc_uid generation failed.");
}

async function main() {
  await migrate();

  if (!env.defaultAdminPassword) {
    throw new Error("DEFAULT_ADMIN_PASSWORD is required for admin initialization.");
  }
  const adminPassword = env.defaultAdminPassword;

  const existing = await dbGet<typeof users.$inferSelect>(db.select().from(users).where(eq(users.username, env.defaultAdminUsername)).limit(1));
  const shouldResetExistingPassword =
    flagEnabled("CHENDOC_RESET_ADMIN_PASSWORD") || flagEnabled("CHENDOC_FORCE_ADMIN_RESET");
  let passwordHash: string | null = null;
  let adminId: number;

  async function getPasswordHash() {
    passwordHash ??= await hashPassword(adminPassword);
    return passwordHash;
  }

  if (existing) {
    adminId = existing.id;
    if (shouldResetExistingPassword) {
      await dbRun(db.update(users).set({
        passwordHash: await getPasswordHash(),
        role: "admin",
        status: "active",
        isSuperAdmin: true,
        updatedAt: now()
      }).where(eq(users.id, existing.id)));
      console.log(`Admin exists: ${env.defaultAdminUsername}. Password reset because CHENDOC_RESET_ADMIN_PASSWORD=1.`);
    } else {
      await dbRun(db.update(users).set({
        role: "admin",
        status: "active",
        isSuperAdmin: true,
        updatedAt: now()
      }).where(eq(users.id, existing.id)));
      console.log(`Admin exists: ${env.defaultAdminUsername}. Password unchanged. Set CHENDOC_RESET_ADMIN_PASSWORD=1 to reset it.`);
    }
  } else {
    const createdAt = now();
    const result = await dbRun(db.insert(users).values({
      username: env.defaultAdminUsername,
      passwordHash: await getPasswordHash(),
      role: "admin",
      status: "active",
      isSuperAdmin: true,
      createdAt,
      updatedAt: createdAt
    }));
    adminId = Number(result.lastInsertRowid);
  }

  const defaultSpace = await dbGet<typeof spaces.$inferSelect>(db.select().from(spaces).limit(1));
  const spaceId = defaultSpace?.id ?? Number((await dbRun(db.insert(spaces).values({
    name: "默认空间",
    description: "ChenDoc 初始空间",
    ownerId: adminId,
    createdAt: now(),
    updatedAt: now()
  }))).lastInsertRowid);

  const existingShare111 = await dbGet<typeof shares.$inferSelect>(db.select().from(shares).where(eq(shares.shareCode, 111)).limit(1));
  if (!existingShare111) {
    const welcomeContentJson = JSON.stringify({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "ChenDoc 已准备好" }] },
        { type: "paragraph", content: [{ type: "text", text: "这是系统初始化创建的第一篇示例文档，你可以在后台编辑、发布或删除它。" }] }
      ]
    });
    const welcomeContentHtml = "<h2>ChenDoc 已准备好</h2><p>这是系统初始化创建的第一篇示例文档，你可以在后台编辑、发布或删除它。</p>";
    const createdAt = now();
    const docId = Number((await dbRun(db.insert(docs).values({
      docUid: await createUniqueDocUid(),
      spaceId,
      parentId: null,
      title: "欢迎使用 ChenDoc",
      ...encryptDocumentContent(welcomeContentJson, welcomeContentHtml),
      status: "published",
      sort: 0,
      ownerId: adminId,
      ownerRole: "super_admin",
      createdBy: adminId,
      updatedBy: adminId,
      scope: "admin",
      isSuperAdminDoc: true,
      visibility: "private",
      tenantKey: "default",
      createdAt,
      updatedAt: createdAt
    }))).lastInsertRowid);

    await dbRun(db.insert(shares).values({
      docId,
      shareCode: 111,
      shareToken: generateShareToken(),
      isEnabled: false,
      viewCount: 0,
      createdAt: now(),
      updatedAt: now()
    }));
  }

  console.log(`Admin initialized: ${env.defaultAdminUsername}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Admin init failed.");
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
