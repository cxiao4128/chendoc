import { nativeConfirm } from "../services/nativeDialog";

export function useConfirm() {
  return {
    confirm: nativeConfirm
  };
}
