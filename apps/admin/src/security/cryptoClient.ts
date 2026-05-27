import { packGatewayBody } from "../gateway/client";

export async function encryptRequest(data: unknown) {
  return (await packGatewayBody(data)).envelope;
}
