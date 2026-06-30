import { verifyPassword } from "file:///D:/desktop/bixu/js/chensdoc-claude/server/src/utils/password.js";

const hash = "$argon2id$v=19$m=19456,t=2,p=1$IKJlXQbfiCQJJCpsOUzy5A$iTbhwP64waE6hqD/jFCQqpHt6Rz9unma53U+DiQzGFw";

console.log("Testing passwords:");
console.log("1314520x:", await verifyPassword("1314520x", hash));
console.log("admin123:", await verifyPassword("admin123", hash));
