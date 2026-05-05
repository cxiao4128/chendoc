import { constants, privateDecrypt, publicEncrypt } from "node:crypto";

export function decryptRsaOaepBase64(privateKeyPem: string, encryptedValue: string) {
  const decrypted = privateDecrypt(
    {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    Buffer.from(encryptedValue, "base64")
  );
  return decrypted.toString("utf8");
}

export function encryptRsaOaepBase64(publicKeyPem: string, value: string) {
  const encrypted = publicEncrypt(
    {
      key: publicKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    Buffer.from(value, "utf8")
  );
  return encrypted.toString("base64");
}
