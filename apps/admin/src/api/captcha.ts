import { request } from "./request";

export interface CaptchaResponse {
  captchaId: string;
  image: string;
}

export function fetchCaptcha() {
  return request<CaptchaResponse>("/api/captcha");
}
