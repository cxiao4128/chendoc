export function useDebounce<TArgs extends unknown[]>(handler: (...args: TArgs) => void, delay = 300) {
  let timer: number | undefined;

  return (...args: TArgs) => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => handler(...args), delay);
  };
}
