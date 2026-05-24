import { buildAuthorization, clearAuthSession, createResponseDecryptor, encryptRequest, getSessionId, saveAuthSession } from "../security";
import { isEncryptedResponse } from "../security/responseCrypto";

export { buildAuthorization as createEncryptedAuthorization, clearAuthSession, createResponseDecryptor, getSessionId, isEncryptedResponse };
export const createEncryptedPayload = encryptRequest;
export const setAuthSession = saveAuthSession;
