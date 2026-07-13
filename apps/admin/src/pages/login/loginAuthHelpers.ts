export function errorCode(err: unknown) {
  if (err && typeof err === "object" && "code" in err) return String((err as { code?: unknown }).code || "");
  return "";
}

export function loginErrorMessage(err: unknown, captchaWasRequired: boolean) {
  const code = errorCode(err);
  if (code === "USER_DISABLED" || code === "USER_NOT_FOUND" || code === "USER_DELETED") return "账号或密码不正确。";
  if (code === "INVALID_CREDENTIALS") return "账号或密码不正确。";
  if (code === "CAPTCHA_REQUIRED") {
    const message = err instanceof Error ? err.message : "";
    if (captchaWasRequired && message.includes("验证码")) return "验证码不正确或已过期";
    if (message.includes("账号") || message.includes("密码")) return "账号或密码不正确";
    return "";
  }
  if (code === "LOGIN_LOCKED") return err instanceof Error ? err.message : "尝试次数过多，请稍后再来。";
  if (code === "TOTP_REQUIRED") return "请输入管理员 OTP 或一次性恢复码";
  if (code === "WEB_CRYPTO_UNAVAILABLE") return "当前地址不支持安全登录，请使用 HTTPS 地址。";
  return "暂时无法登录，请刷新后重试。";
}

export function loginFailureText(reason: string) {
  const cleanReason = reason.trim().replace(/^登录失败[：:]\s*/, "");
  return cleanReason ? `登录失败：${cleanReason}` : "登录失败";
}

export function shouldRevealCaptcha(code: string) {
  return code === "INVALID_CREDENTIALS" || code === "CAPTCHA_REQUIRED";
}

export async function promptSecondFactor() {
  const { nativeFormDialog } = await import("../../services/nativeDialog");
  const values = await nativeFormDialog({
    theme: "auth",
    title: "管理员验证器",
    message: "请输入 Google Authenticator / Microsoft Authenticator 的 6 位验证码。没有设备时可填写一次性恢复码。",
    confirmText: "完成登录",
    fields: [
      {
        key: "otp",
        label: "OTP 验证码",
        type: "text",
        inputmode: "numeric",
        autocomplete: "one-time-code",
        maxlength: 6,
        placeholder: "6 位验证码",
        autofocus: true
      },
      {
        key: "recoveryCode",
        label: "一次性恢复码",
        type: "text",
        autocomplete: "off",
        placeholder: "没有 OTP 时填写"
      }
    ]
  });
  const otp = values?.otp?.trim() || "";
  const recoveryCode = values?.recoveryCode?.trim() || "";
  if (!values || (!otp && !recoveryCode)) {
    throw Object.assign(new Error("请输入管理员 OTP 或一次性恢复码"), { code: "TOTP_REQUIRED" });
  }
  return {
    otp: otp || undefined,
    recoveryCode: recoveryCode || undefined
  };
}
