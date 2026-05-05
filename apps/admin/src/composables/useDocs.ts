import { useDocStore } from "../stores/doc";

export function useDocs() {
  const store = useDocStore();
  return store;
}
