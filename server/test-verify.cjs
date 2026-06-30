const bcrypt = require("bcryptjs");

async function argon2Module() {
  try {
    return await import("argon2");
  } catch {
    return null;
  }
}

async function verifyPassword(password, hash) {
  console.log("verifyPassword called:");
  console.log("  password:", password);
  console.log("  hash starts with:", hash.substring(0, 20));
  console.log("  hash starts with $argon2:", hash.startsWith("$argon2"));

  if (hash.startsWith("$argon2")) {
    console.log("  Using argon2 verification...");
    const argon2 = await argon2Module();
    if (!argon2) {
      console.log("  argon2 module not available!");
      return false;
    }
    const result = await argon2.default.verify(hash, password);
    console.log("  argon2 verification result:", result);
    return result;
  }
  console.log("  Using bcrypt verification...");
  const result = bcrypt.compareSync(password, hash);
  console.log("  bcrypt verification result:", result);
  return result;
}

// Test
const argon2Hash = "$argon2id$v=19$m=19456,t=2,p=1$8VjjRStQzAeE+Zi9KfXpLA$BsofyyIBTRRdEKvanXAiiwL6rvzizijHKDEx4zpHKD0";

console.log("\nTesting verifyPassword function:\n");
verifyPassword("1314520x", argon2Hash).then(result => {
  console.log("\nFinal result:", result);
}).catch(e => {
  console.error("Error:", e);
});