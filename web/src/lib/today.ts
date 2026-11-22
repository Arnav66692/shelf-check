"use client";

import { useSyncExternalStore } from "react";

function noSubscription(): () => void {
  return () => undefined;
}

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function useToday(): Date | null {
  const key = useSyncExternalStore(noSubscription, todayKey, () => null);
  return key === null ? null : new Date(`${key}T12:00:00`);
}
