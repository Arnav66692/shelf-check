"use client";

import { useCallback, useSyncExternalStore } from "react";
import { EMPTY_PROFILE, type Product, type Profile } from "./model";

const CABINET_KEY = "shelf-check.cabinet.v1";
const PROFILE_KEY = "shelf-check.profile.v1";
const CHANGE_EVENT = "shelf-check:change";
const EMPTY_CABINET: readonly Product[] = [];

const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  const raw = window.localStorage.getItem(key);
  const cached = cache.get(key);
  if (cached && cached.raw === raw) return cached.value as T;
  const value = raw === null ? fallback : (JSON.parse(raw) as T);
  cache.set(key, { raw, value });
  return value;
}

function write<T>(key: string, value: T): void {
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function useCabinet() {
  const items = useSyncExternalStore(
    subscribe,
    () => read<readonly Product[]>(CABINET_KEY, EMPTY_CABINET),
    () => EMPTY_CABINET,
  );
  const add = useCallback((product: Product) => {
    const current = read<readonly Product[]>(CABINET_KEY, EMPTY_CABINET);
    if (current.some((item) => item.id === product.id)) return;
    write(CABINET_KEY, [...current, product]);
  }, []);
  const remove = useCallback((id: string) => {
    write(CABINET_KEY, read<readonly Product[]>(CABINET_KEY, EMPTY_CABINET).filter((item) => item.id !== id));
  }, []);
  const replaceAll = useCallback((products: readonly Product[]) => write(CABINET_KEY, products), []);
  return { items, add, remove, replaceAll };
}

export function useProfile() {
  const profile = useSyncExternalStore(
    subscribe,
    () => read<Profile>(PROFILE_KEY, EMPTY_PROFILE),
    () => EMPTY_PROFILE,
  );
  const save = useCallback((next: Profile) => write(PROFILE_KEY, next), []);
  return { profile, save };
}
