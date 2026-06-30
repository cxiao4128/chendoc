import { eq } from "drizzle-orm";
import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import * as schema from "./dist/db/schema.js";
import bcrypt from "bcryptjs";

const sqlite = new Database("d:/desktop/bixu/js/chensdoc-claude/server/data/chendoc.sqlite");
const db = drizzleSqlite(sqlite, { schema });

async function test() {
  console.log("Testing login flow...\n");

  // Test 1: Direct SQLite query
  const rawUser = sqlite.prepare("SELECT * FROM users WHERE username = ?").get("xchen");
  console.log("1. Raw SQLite query result:");
  console.log("   Keys:", Object.keys(rawUser));
  console.log("   username:", rawUser.username);
  console.log("   password_hash:", rawUser.password_hash?.substring(0, 30));

  // Test 2: bcrypt verification
  const bcryptValid = bcrypt.compareSync("1314520x", rawUser.password_hash);
  console.log("\n2. bcrypt password verification:", bcryptValid);

  // Test 3: Drizzle query
  console.log("\n3. Testing drizzle query...");
  try {
    const drizzleUser = await db.select().from(schema.users).where(eq(schema.users.username, "xchen")).limit(1).get();
    console.log("   Drizzle result:", !!drizzleUser);
    if (drizzleUser) {
      console.log("   Keys:", Object.keys(drizzleUser));
      console.log("   username:", drizzleUser.username);
      console.log("   passwordHash:", drizzleUser.passwordHash);
    }
  } catch (e) {
    console.log("   Drizzle error:", e.message);
  }

  sqlite.close();
}

test().catch(console.error);