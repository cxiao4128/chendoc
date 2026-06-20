import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url?.startsWith("mysql://")) throw new Error("DATABASE_URL must be mysql://");
const connection = await mysql.createConnection(url);
try {
  await connection.beginTransaction();
  const stamp = Date.now();
  const [userResult] = await connection.execute(
    "INSERT INTO users (username,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,NOW(3),NOW(3))",
    [`ci-${stamp}`, "test-only", "user", "active"]
  );
  const userId = Number((userResult as mysql.ResultSetHeader).insertId);
  const [formResult] = await connection.execute(
    "INSERT INTO forms (form_uid,title,fields,owner_id,status,created_at,updated_at) VALUES (?,?,?,?,?,NOW(3),NOW(3))",
    [`ci${stamp}`, "CI", "[]", userId, "draft"]
  );
  const formId = Number((formResult as mysql.ResultSetHeader).insertId);
  await connection.execute(
    "INSERT INTO form_submissions (form_id,data,ip,submitted_at) VALUES (?,?,?,NOW(3))",
    [formId, "{}", "ci"]
  );
  await connection.execute("DELETE FROM forms WHERE id = ?", [formId]);
  const [children] = await connection.execute("SELECT COUNT(*) count FROM form_submissions WHERE form_id = ?", [formId]);
  if (Number((children as Array<{ count: number }>)[0]?.count) !== 0) throw new Error("form_submissions cascade failed");
  let rejected = false;
  try {
    await connection.execute(
      "INSERT INTO forms (form_uid,title,fields,owner_id,status,created_at,updated_at) VALUES (?,?,?,?,?,NOW(3),NOW(3))",
      [`bad${stamp}`, "bad", "[]", 2_147_483_647, "draft"]
    );
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("orphan form owner was accepted");
  console.log("MySQL foreign-key smoke passed");
} finally {
  await connection.rollback().catch(() => undefined);
  await connection.end();
}
