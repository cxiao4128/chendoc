import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, test } from "vitest";

const tempDir = mkdtempSync(join(tmpdir(), "chendoc-forms-service-"));
const secret = "x".repeat(32);
Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_PROVIDER: "sqlite",
  DATABASE_URL: join(tempDir, "chendoc.sqlite"),
  JWT_SECRET: secret,
  CONFIG_ENCRYPTION_KEY: secret,
  RSA_PRIVATE_KEY_ENCRYPTION_KEY: secret,
  CHENDOC_DOCUMENT_ENCRYPTION_KEY: secret,
  DEFAULT_ADMIN_PASSWORD: "Test!Password123"
});

const { migrate } = await import("../../db/migrate.js");
await migrate();
const { closeDatabase, db, sqlite } = await import("../../db/client.js");
const { forms, formSubmissions, users } = await import("../../db/schema.js");
const {
  createForm, deleteAllFormSubmissions, deleteSubmission, publishForm, submitForm, updateForm
} = await import("./forms.service.js");

const actor = { id: 1, role: "user" } as const;
const fields = [{ id: "name", type: "text" as const, label: "姓名", required: true, order: 0 }];

beforeEach(() => {
  sqlite.exec("DELETE FROM form_submissions; DELETE FROM forms; DELETE FROM users; DELETE FROM sqlite_sequence WHERE name IN ('form_submissions', 'forms', 'users');");
  db.insert(users).values({
    username: "writer", passwordHash: "hash", role: "user", status: "active",
    createdAt: new Date(), updatedAt: new Date()
  }).run();
});

afterAll(async () => {
  await closeDatabase();
  rmSync(tempDir, { recursive: true, force: true });
});

describe("form submission policy", () => {
  test("rejects invalid field contracts before publishing", async () => {
    await expect(createForm(actor, {
      title: "无选项",
      fields: [{ id: "choice", type: "radio", label: "选择", required: true, order: 0 }]
    })).rejects.toThrow(/至少需要一个选项/);

    await expect(createForm(actor, {
      title: "重复字段",
      fields: [fields[0], { ...fields[0], label: "别名", order: 1 }]
    })).rejects.toThrow(/字段 ID 不能重复/);

    const sectionOnly = await createForm(actor, {
      title: "只有分节",
      fields: [{ id: "section", type: "section", label: "说明", required: false, order: 0 }]
    });
    await expect(publishForm(sectionOnly.id, actor)).rejects.toMatchObject({ code: "FORM_NO_FIELDS" });
  });

  test("persists numeric maxSubmissions on create and update", async () => {
    const form = await createForm(actor, { title: "报名", fields, config: { maxSubmissions: 12 } });
    expect(form.maxSubmissions).toBe(12);
    expect((await updateForm(form.id, actor, { config: { maxSubmissions: 7 } })).maxSubmissions).toBe(7);
  });

  test("rejects unknown fields and repeated IP when allowMultiple is false", async () => {
    const form = await createForm(actor, { title: "报名", fields, config: { allowMultiple: false } });
    await publishForm(form.id, actor);
    await expect(submitForm(form.formUid, { name: "甲", hidden: "x" }, { ip: "10.0.0.1" }))
      .rejects.toMatchObject({ code: "FORM_UNKNOWN_FIELD" });
    await submitForm(form.formUid, { name: "甲" }, { ip: "10.0.0.1" });
    await expect(submitForm(form.formUid, { name: "乙" }, { ip: "10.0.0.1" }))
      .rejects.toMatchObject({ code: "FORM_DUPLICATE_SUBMISSION" });
  });

  test("reserves the limit atomically and never decrements below zero", async () => {
    const form = await createForm(actor, { title: "限额", fields, config: { maxSubmissions: 1, allowMultiple: true } });
    await publishForm(form.id, actor);
    await submitForm(form.formUid, { name: "甲" }, { ip: "10.0.0.1" });
    await expect(submitForm(form.formUid, { name: "乙" }, { ip: "10.0.0.2" }))
      .rejects.toMatchObject({ code: "FORM_FULL" });

    const submission = db.select().from(formSubmissions).where(eq(formSubmissions.formId, form.id)).get();
    db.update(forms).set({ submissionCount: 0 }).where(eq(forms.id, form.id)).run();
    await deleteSubmission(form.id, submission!.id, actor);
    expect(db.select().from(forms).where(eq(forms.id, form.id)).get()?.submissionCount).toBe(0);
  });

  test("rejects false for a required checkbox", async () => {
    const checkboxFields = [
      { id: "agree", type: "checkbox" as const, label: "Agreement", required: true, order: 0 }
    ];
    const form = await createForm(actor, { title: "Confirmation", fields: checkboxFields });
    await publishForm(form.id, actor);

    await expect(submitForm(form.formUid, { agree: false }, { ip: "10.0.0.3" }))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(submitForm(form.formUid, { agree: "false" }, { ip: "10.0.0.3" }))
      .rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(submitForm(form.formUid, { agree: true }, { ip: "10.0.0.3" }))
      .resolves.toMatchObject({ ok: true });
  });

  test("validates preset fields and rating values", async () => {
    const presetFields = [
      { id: "age", type: "age" as const, label: "年龄", required: true, min: 1, max: 120, order: 0 },
      { id: "idcard", type: "idcard" as const, label: "身份证号", required: true, order: 1 },
      { id: "gender", type: "gender" as const, label: "性别", required: true, order: 2 },
      { id: "rating", type: "rating" as const, label: "评分", required: true, order: 3 }
    ];
    const form = await createForm(actor, { title: "资料", fields: presetFields });
    await publishForm(form.id, actor);

    await expect(submitForm(form.formUid, {
      age: "0", idcard: "123", gender: "未知", rating: "6"
    }, { ip: "10.0.0.9" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(submitForm(form.formUid, {
      age: "20", idcard: "11010519491231002X", gender: "其他", rating: "5"
    }, { ip: "10.0.0.9" })).resolves.toMatchObject({ ok: true });
  });

  test("deletes all submissions transactionally and preserves concurrent count increments", async () => {
    const form = await createForm(actor, { title: "Cleanup", fields, config: { allowMultiple: true } });
    await publishForm(form.id, actor);
    await submitForm(form.formUid, { name: "A" }, { ip: "10.0.0.4" });
    await submitForm(form.formUid, { name: "B" }, { ip: "10.0.0.5" });
    db.update(forms).set({ submissionCount: 3 }).where(eq(forms.id, form.id)).run();

    await expect(deleteAllFormSubmissions(form.id, actor)).resolves.toEqual({ deleted: 2 });
    expect(db.select().from(formSubmissions).where(eq(formSubmissions.formId, form.id)).all()).toHaveLength(0);
    expect(db.select().from(forms).where(eq(forms.id, form.id)).get()?.submissionCount).toBe(1);

    await submitForm(form.formUid, { name: "C" }, { ip: "10.0.0.6" });
    sqlite.exec(`
      CREATE TRIGGER fail_form_submission_count_update
      BEFORE UPDATE OF submission_count ON forms
      WHEN NEW.submission_count <> OLD.submission_count
      BEGIN
        SELECT RAISE(ABORT, 'forced counter failure');
      END;
    `);
    try {
      await expect(deleteAllFormSubmissions(form.id, actor)).rejects.toThrow(/forced counter failure/);
      expect(db.select().from(formSubmissions).where(eq(formSubmissions.formId, form.id)).all()).toHaveLength(1);
      expect(db.select().from(forms).where(eq(forms.id, form.id)).get()?.submissionCount).toBe(2);
    } finally {
      sqlite.exec("DROP TRIGGER IF EXISTS fail_form_submission_count_update;");
    }
  });

  test("requires captcha from the third submission by one IP", async () => {
    const form = await createForm(actor, { title: "验证码", fields, config: { allowMultiple: true } });
    await publishForm(form.id, actor);
    await submitForm(form.formUid, { name: "甲" }, { ip: "10.0.0.8" });
    await submitForm(form.formUid, { name: "乙" }, { ip: "10.0.0.8" });
    await expect(submitForm(form.formUid, { name: "丙" }, { ip: "10.0.0.8" }))
      .rejects.toMatchObject({ code: "FORM_NEED_CAPTCHA" });
  });
});
