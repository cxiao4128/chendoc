import { reactive } from "vue";

export interface NativeDialogField {
  key: string;
  label: string;
  value?: string;
  type?: "text" | "password" | "number" | "search";
  placeholder?: string;
  autocomplete?: string;
  inputmode?: "text" | "numeric" | "decimal" | "tel" | "search" | "email" | "url";
  maxlength?: number;
  required?: boolean;
  autofocus?: boolean;
}

export type NativeDialogKind = "confirm" | "prompt" | "form";
export type NativeDialogResult = boolean | string | Record<string, string>;

export interface NativeDialogRequest {
  id: number;
  kind: NativeDialogKind;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  fields?: NativeDialogField[];
}

export const nativeDialogState = reactive<{ request: NativeDialogRequest | null }>({
  request: null
});

let nextId = 1;
let resolver: ((value: NativeDialogResult | null) => void) | null = null;
const queue: Array<{
  request: NativeDialogRequest;
  resolve: (value: NativeDialogResult | null) => void;
}> = [];

function runNext() {
  if (nativeDialogState.request || !queue.length) return;
  const next = queue.shift();
  if (!next) return;
  nativeDialogState.request = next.request;
  resolver = next.resolve;
}

function requestDialog<T extends NativeDialogResult>(request: Omit<NativeDialogRequest, "id">) {
  return new Promise<T | null>((resolve) => {
    queue.push({
      request: { ...request, id: nextId++ },
      resolve
    });
    runNext();
  });
}

export function resolveNativeDialog(value: NativeDialogResult | null) {
  if (!nativeDialogState.request) return;
  const done = resolver;
  nativeDialogState.request = null;
  resolver = null;
  done?.(value);
  window.setTimeout(runNext, 0);
}

export function nativeConfirm(options: string | Omit<NativeDialogRequest, "id" | "kind" | "fields">) {
  const request = typeof options === "string" ? { title: options } : options;
  return requestDialog<boolean>({ kind: "confirm", ...request }).then(Boolean);
}

export function nativePrompt(options: string | (Omit<NativeDialogRequest, "id" | "kind" | "fields"> & {
  label?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
})) {
  const request = typeof options === "string"
    ? { title: options }
    : options;
  return requestDialog<string>({
    kind: "prompt",
    title: request.title,
    message: request.message,
    confirmText: request.confirmText,
    cancelText: request.cancelText,
    danger: request.danger,
    fields: [{
      key: "value",
      label: typeof options === "string" ? "内容" : options.label || "内容",
      value: typeof options === "string" ? "" : options.value || "",
      placeholder: typeof options === "string" ? "" : options.placeholder,
      required: typeof options === "string" ? false : options.required,
      autofocus: true
    }]
  });
}

export function nativeFormDialog(options: Omit<NativeDialogRequest, "id" | "kind">) {
  return requestDialog<Record<string, string>>({ kind: "form", ...options });
}
