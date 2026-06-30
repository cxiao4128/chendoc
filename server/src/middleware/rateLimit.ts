function isE2eTesting() {
  return process.env.CHENDOC_E2E_TESTING === "true";
}

export const loginRateLimit = {
  max: isE2eTesting() ? 10_000 : 10,
  timeWindow: "10 minutes"
};

export const registerRateLimit = {
  max: isE2eTesting() ? 10_000 : 8,
  timeWindow: "30 minutes"
};
