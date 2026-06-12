import bcrypt from "bcryptjs";

const USERNAME_RE = /^[A-Za-z0-9_]{6,}$/;
const MIN_PASSWORD_LENGTH = 6;

type Argon2Module = {
  argon2id: number;
  hash: (password: string, options: { type: number; memoryCost: number; timeCost: number; parallelism: number }) => Promise<string>;
  verify: (hash: string, password: string) => Promise<boolean>;
};

async function argon2Module() {
  try {
    const importer = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<Argon2Module>;
    return await importer("argon2");
  } catch {
    return null;
  }
}

export async function hashPassword(password: string) {
  const argon2 = await argon2Module();
  if (argon2) {
    return await argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1
    });
  }
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string) {
  if (hash.startsWith("$argon2")) {
    const argon2 = await argon2Module();
    if (!argon2) return false;
    return await argon2.verify(hash, password);
  }
  return bcrypt.compare(password, hash);
}

export function validateUserRegistration(username: string, password: string) {
  if (!USERNAME_RE.test(username)) {
    return "账号至少 6 位，只能包含字母、数字、下划线";
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `密码至少 ${MIN_PASSWORD_LENGTH} 位`;
  }
  return null;
}
