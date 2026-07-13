import type { FormField } from "./types";
import type { FormEditorTab } from "./form-editor.types";

export function isFormEditorTab(value: unknown): value is FormEditorTab {
  return value === "edit" || value === "stats" || value === "settings";
}

export function generateFormFieldId() {
  return crypto.randomUUID();
}

export function normalizePositiveInteger(value: unknown, max?: number) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1 || (max !== undefined && number > max)) return null;
  return number;
}

export function optionalFiniteNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function calculateFieldStats(submissions: { data: Record<string, unknown> }[], fields: FormField[]) {
  return fields
    .filter((field) => field.type !== "section")
    .map((field) => {
      const count = submissions.filter((submission) => {
        const value = submission.data[field.id];
        return value !== undefined && value !== null && value !== "" && (Array.isArray(value) ? value.length > 0 : true);
      }).length;
      const percentage = submissions.length > 0 ? Math.round((count / submissions.length) * 100) : 0;
      return { fieldId: field.id, label: field.label, count, percentage };
    });
}
