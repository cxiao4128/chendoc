import type { GatewayActionCode } from "../../../../server/src/gateway/action-registry";

export interface ChallengeView {
  nonce: string;
  issuedAt: number | string;
  expireAt: number | string;
  mode?: string;
}

export interface ChallengeBox {
  value: ChallengeView;
  expireAt: number;
}

export interface PublicKeyResponse {
  keyId: string;
  publicKey: string;
  expireAt: number | string;
  challenge?: ChallengeView;
}

export interface ImportedServerKey {
  keyId: string;
  key: CryptoKey;
}

export interface GatewayResponsePacket<T = unknown> {
  v: string;
  code: number | string;
  message: string;
  data: T;
  timestamp: number;
  requestId: string;
}

export interface PackedGatewayBody {
  envelope: { data: string };
}

export interface GatewayAction {
  action: GatewayActionCode;
  payload: Record<string, unknown>;
}
