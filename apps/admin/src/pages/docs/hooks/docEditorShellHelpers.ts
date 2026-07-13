export function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : typeof error === "object" && !!error && "name" in error && (error as { name?: unknown }).name === "AbortError";
}

export async function waitForSaving(isSaving: () => boolean) {
  await new Promise<void>(resolve => {
    const check = () => {
      if (!isSaving()) { resolve(); return; }
      setTimeout(check, 50);
    };
    check();
  });
}
