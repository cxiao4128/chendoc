import { ref } from "vue";

export function useBoolean(initialValue = false) {
  const value = ref(initialValue);
  const setTrue = () => { value.value = true; };
  const setFalse = () => { value.value = false; };
  const toggle = () => { value.value = !value.value; };
  const setValue = (next: boolean) => { value.value = next; };

  return { value, setTrue, setFalse, toggle, setValue };
}
