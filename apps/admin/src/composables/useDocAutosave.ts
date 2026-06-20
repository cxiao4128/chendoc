export function useDocAutosave(options: {
  delayMs: number;
  isSaving: () => boolean;
  onQueued: () => void;
  save: () => Promise<unknown>;
}) {
  let timer: number | undefined;

  function clear() {
    if (!timer) return;
    window.clearTimeout(timer);
    timer = undefined;
  }

  function schedule() {
    clear();
    timer = window.setTimeout(() => {
      timer = undefined;
      if (options.isSaving()) {
        options.onQueued();
        return;
      }
      void options.save();
    }, options.delayMs);
  }

  return { clear, schedule };
}
