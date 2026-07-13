import { backendFetch } from "../../config/runtime";
import type { FormField } from "./types";

export interface PublicFormView {
  site: {
    name: string;
    logoUrl: string;
  };
  form: {
    formUid: string;
    title: string;
    description: string | null;
    fields: FormField[];
    privacyNotice: string | null;
    retentionDays: number | null;
  };
}

export interface PublicFormSubmissionResult {
  ok: true;
  submittedAt: string;
  exclusiveInfo: Record<string, string> | null;
}

export class PublicFormApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code = "PUBLIC_FORM_REQUEST_FAILED"
  ) {
    super(message);
    this.name = "PublicFormApiError";
  }
}

async function publicJsonRequest<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await backendFetch(path, { ...options, headers });
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new PublicFormApiError(
      typeof payload?.message === "string" ? payload.message : "请求失败，请稍后重试",
      response.status,
      typeof payload?.code === "string" ? payload.code : undefined
    );
  }
  return payload as T;
}

export function getPublicForm(formUid: string) {
  return publicJsonRequest<PublicFormView>(`/api/public/forms/${encodeURIComponent(formUid)}`);
}

export async function submitPublicForm(
  formUid: string,
  data: Record<string, unknown>,
  captcha?: { captchaId?: string; captchaCode?: string }
) {
  const response = await publicJsonRequest<{
    code: 0;
    message: string;
    data: PublicFormSubmissionResult;
  }>(`/api/public/forms/${encodeURIComponent(formUid)}/submissions`, {
    method: "POST",
    body: JSON.stringify({ data, ...captcha })
  });
  return response.data;
}

export async function getPublicFormCaptcha() {
  const { fetchCaptcha } = await import("../../api/captcha");
  return fetchCaptcha();
}
