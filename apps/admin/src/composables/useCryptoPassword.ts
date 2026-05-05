export function useCryptoPassword() {
  async function encryptPassword(password: string) {
    return { password };
  }

  return { encryptPassword };
}
