import { BadRequestError } from "../../utils/errors.js";
import type { FormField, FormRecord } from "./forms.service.js";

const NON_INPUT_FIELDS = new Set<FormField["type"]>(["section"]);

function hasValue(value: unknown) {
  if (value === false) return true;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && String(value).trim() !== "";
}

export class FormSubmissionPolicy {
  constructor(
    private readonly form: FormRecord,
    private readonly previousSubmissionsFromIp: number,
    private readonly previousSubmissionsFromSubmitter = 0
  ) {}

  assertAvailable() {
    if (this.form.status !== "published") {
      throw new BadRequestError("表单未发布或已关闭", "FORM_NOT_AVAILABLE");
    }
    if (this.form.maxSubmissions !== null && this.form.submissionCount >= this.form.maxSubmissions) {
      throw new BadRequestError("提交人数已满", "FORM_FULL");
    }
  }

  assertRepeatAllowed() {
    if (!this.form.allowMultiple && this.previousSubmissionsFromSubmitter > 0) {
      throw new BadRequestError("该表单不允许重复提交", "FORM_DUPLICATE_SUBMISSION");
    }
  }

  requiresCaptcha() {
    return this.previousSubmissionsFromIp >= 2;
  }

  assertFieldWhitelist(data: Record<string, unknown>) {
    const allowedIds = new Set(
      this.form.fields.filter((field) => !NON_INPUT_FIELDS.has(field.type)).map((field) => field.id)
    );
    const unknown = Object.keys(data).find((key) => !allowedIds.has(key));
    if (unknown) {
      throw new BadRequestError(`提交包含未知字段：${unknown}`, "FORM_UNKNOWN_FIELD");
    }
  }

  assertRequiredFields(data: Record<string, unknown>) {
    const missing = this.form.fields.find((field) => field.required && !NON_INPUT_FIELDS.has(field.type) && !hasValue(data[field.id]));
    if (missing) {
      throw new BadRequestError(`请填写"${missing.label}"`, "VALIDATION_ERROR");
    }
  }
}
