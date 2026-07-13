export type Maybe<T> = T | null | undefined;

export type EntityId = string | number;

export interface SelectOption<T extends string | number = string> {
  label: string;
  value: T;
  disabled?: boolean;
}

export type LoadState = "idle" | "loading" | "empty" | "error" | "ready";
