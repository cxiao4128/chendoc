import { computed, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import {
  getPublicForm,
  getPublicFormCaptcha,
  PublicFormApiError,
  submitPublicForm,
  type PublicFormView
} from "../public-form.api";
import type { FormField } from "../types";

export type PublicFormValue = string | number | boolean | string[];
export type PublicFormCityValue = { province: string; city: string };

function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.join("、");
  if (value === true || value === "true") return "是";
  if (value === false || value === "false") return "否";
  return String(value);
}

export function usePublicForm() {
  const route = useRoute();
  const loading = ref(true);
  const submitting = ref(false);
  const loadError = ref("");
  const submitError = ref("");
  const view = ref<PublicFormView | null>(null);
  const values = reactive<Record<string, PublicFormValue>>({});
  const cityValues = reactive<Record<string, PublicFormCityValue>>({});
  const submittedData = ref<Record<string, unknown> | null>(null);
  const exclusiveInfo = ref<Record<string, string> | null>(null);
  const captcha = ref<{ captchaId: string; image: string } | null>(null);
  const captchaCode = ref("");

  const formUid = computed(() => String(route.params.formUid || ""));
  const fields = computed(() => view.value?.form.fields ?? []);
  const fieldLabels = computed(() => Object.fromEntries(
    fields.value.filter((field) => field.type !== "section").map((field) => [field.id, field.label])
  ));
  const submittedEntries = computed(() => Object.entries(submittedData.value ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "" && (!Array.isArray(value) || value.length > 0))
    .map(([key, value]) => [fieldLabels.value[key] || "已填写", displayValue(value)] as const));
  const exclusiveEntries = computed(() => Object.entries(exclusiveInfo.value ?? {}).filter(([, value]) => value.trim()));

  function resetValues(formFields: FormField[]) {
    for (const key of Object.keys(values)) delete values[key];
    for (const key of Object.keys(cityValues)) delete cityValues[key];
    for (const field of formFields) {
      if (field.type === "section") continue;
      if (field.type === "multiselect") values[field.id] = [];
      else if (field.type === "checkbox") values[field.id] = false;
      else if (field.type === "city") cityValues[field.id] = { province: "", city: "" };
      else values[field.id] = "";
    }
  }

  async function loadForm() {
    loading.value = true;
    loadError.value = "";
    submitError.value = "";
    submittedData.value = null;
    exclusiveInfo.value = null;
    captcha.value = null;
    captchaCode.value = "";
    try {
      const result = await getPublicForm(formUid.value);
      view.value = result;
      resetValues(result.form.fields);
      document.title = `${result.form.title} - ${result.site.name}`;
    } catch (error) {
      view.value = null;
      loadError.value = error instanceof Error ? error.message : "表单加载失败";
      document.title = "表单不可用 - 陈书";
    } finally {
      loading.value = false;
    }
  }

  function submissionPayload() {
    const data: Record<string, unknown> = {};
    for (const field of fields.value) {
      if (field.type === "section") continue;
      if (field.type === "city") {
        const city = cityValues[field.id];
        data[field.id] = city?.province && city.city ? `${city.province} ${city.city}` : city?.province || "";
        continue;
      }
      const value = values[field.id];
      if (field.type === "checkbox" && value !== true) continue;
      if (field.type === "multiselect" && Array.isArray(value) && value.length === 0) continue;
      data[field.id] = value;
    }
    return data;
  }

  async function refreshCaptcha() {
    const result = await getPublicFormCaptcha();
    captcha.value = result;
    captchaCode.value = "";
  }

  async function submit() {
    if (!view.value || submitting.value) return;
    submitting.value = true;
    submitError.value = "";
    const data = submissionPayload();
    try {
      const result = await submitPublicForm(formUid.value, data, {
        captchaId: captcha.value?.captchaId,
        captchaCode: captcha.value ? captchaCode.value : undefined
      });
      submittedData.value = data;
      exclusiveInfo.value = result.exclusiveInfo;
    } catch (error) {
      if (error instanceof PublicFormApiError && (error.code === "FORM_NEED_CAPTCHA" || error.code === "FORM_CAPTCHA_FAILED")) {
        try {
          await refreshCaptcha();
        } catch {
          submitError.value = "安全验证加载失败，请刷新页面重试";
          return;
        }
      }
      submitError.value = error instanceof Error ? error.message : "提交失败，请稍后重试";
    } finally {
      submitting.value = false;
    }
  }

  watch(formUid, loadForm, { immediate: true });

  return {
    captcha,
    captchaCode,
    cityValues,
    exclusiveEntries,
    fields,
    loadError,
    loading,
    refreshCaptcha,
    submit,
    submitError,
    submittedData,
    submittedEntries,
    submitting,
    values,
    view
  };
}
