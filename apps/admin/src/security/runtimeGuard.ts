interface ClientRisk {
  webdriver: boolean;
  fetchPatched: boolean;
  cryptoPatched: boolean;
}

let cachedHeader: string | null = null;

function nativeLike(value: unknown) {
  if (typeof value !== "function") return false;
  try {
    return Function.prototype.toString.call(value).includes("[native code]");
  } catch {
    return false;
  }
}

function b64u(value: string) {
  const bytes = new TextEncoder().encode(value);
  let raw = "";
  bytes.forEach((byte) => {
    raw += String.fromCharCode(byte);
  });
  return btoa(raw).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function collectClientRisk(): ClientRisk {
  if (!import.meta.env.PROD) {
    return {
      webdriver: false,
      fetchPatched: false,
      cryptoPatched: false
    };
  }

  const subtle = crypto?.subtle;
  return {
    webdriver: navigator.webdriver === true,
    fetchPatched: !nativeLike(window.fetch),
    cryptoPatched: !nativeLike(subtle?.encrypt) || !nativeLike(subtle?.decrypt)
  };
}

export function buildClientRiskHeader() {
  if (!import.meta.env.PROD) return "";
  if (!cachedHeader) cachedHeader = b64u(JSON.stringify(collectClientRisk()));
  return cachedHeader;
}
