import { buildAuthorization, clearAuthSession, getSessionId, saveAuthSession } from "../security/sessionToken";
import { encryptRequest } from "../security/cryptoClient";

export { buildAuthorization as createEncryptedAuthorization, clearAuthSession, getSessionId };
export const createEncryptedPayload = encryptRequest;
export const setAuthSession = saveAuthSession;
