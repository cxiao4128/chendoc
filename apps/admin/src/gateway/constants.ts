export const PACKET_VERSION = "xchen";
export const REQUEST_PREFIX = "chendoc";
export const RESPONSE_PREFIX = "XCHEN";
export const GATEWAY_DEBUG = import.meta.env.DEV && import.meta.env.VITE_DEBUG_GATEWAY === "true";
export const textEncoder = new TextEncoder();
export const textDecoder = new TextDecoder();

const isTestMode = import.meta.env.MODE === "test";
const packetDisabledForDevelopment = import.meta.env.DEV && (
  String(import.meta.env.VITE_DISABLE_GATEWAY_PACKET ?? "").toLowerCase() === "true"
  || String(import.meta.env.VITE_DISABLE_PACKET_LAYER ?? "").toLowerCase() === "true"
  || String(import.meta.env.VITE_DISABLE_REQUEST_ENCRYPT ?? "").toLowerCase() === "true"
);

export const packetLayerDisabled =
  isTestMode
  || packetDisabledForDevelopment;
