import { ref } from "vue";
import { fetchCaptcha } from "../api/captcha";

export function useCaptcha() {
  const captchaId = ref("");
  const image = ref("");
  const loading = ref(false);

  async function refreshCaptcha() {
    loading.value = true;
    try {
      const response = await fetchCaptcha();
      captchaId.value = response.captchaId;
      image.value = response.image;
    } finally {
      loading.value = false;
    }
  }

  return { captchaId, image, loading, refreshCaptcha };
}
