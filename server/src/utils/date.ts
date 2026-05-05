export function now() {
  return new Date();
}

export function minutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000);
}

export function daysFromNow(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60_000);
}

export function isExpired(value?: Date | null) {
  return !!value && value.getTime() <= Date.now();
}
