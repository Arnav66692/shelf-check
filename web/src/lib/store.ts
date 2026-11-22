"use client";

import { useCallback, useSyncExternalStore } from "react";
import { EMPTY_PROFILE, type Product, type Profile } from "./model";

const HOUSEHOLD_KEY = "shelf-check.household.v2";
const OLD_CABINET_KEY = "shelf-check.cabinet.v1";
const OLD_PROFILE_KEY = "shelf-check.profile.v1";
const CHANGE_EVENT = "shelf-check:change";
const FIRST_PERSON_ID = "me";
const MAX_PEOPLE = 8;

export type Supply = {
  readonly expires?: string;
  readonly dosesLeft?: number;
  readonly dosesPerDay?: number;
};

export type Person = {
  readonly id: string;
  readonly name: string;
  readonly profile: Profile;
  readonly cabinet: readonly Product[];
  readonly supply: Readonly<Record<string, Supply>>;
};

export type Household = { readonly activeId: string; readonly people: readonly Person[] };

const EMPTY_PERSON: Person = { id: FIRST_PERSON_ID, name: "Me", profile: EMPTY_PROFILE, cabinet: [], supply: {} };
const EMPTY_HOUSEHOLD: Household = { activeId: FIRST_PERSON_ID, people: [EMPTY_PERSON] };

let cached: { raw: string | null; value: Household } | undefined;

function parse<T>(raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function fromOldKeys(): Household {
  const cabinet = parse<readonly Product[]>(window.localStorage.getItem(OLD_CABINET_KEY)) ?? [];
  const profile = parse<Profile>(window.localStorage.getItem(OLD_PROFILE_KEY)) ?? EMPTY_PROFILE;
  return { activeId: FIRST_PERSON_ID, people: [{ ...EMPTY_PERSON, cabinet, profile }] };
}

function readHousehold(): Household {
  const raw = window.localStorage.getItem(HOUSEHOLD_KEY);
  if (cached && cached.raw === raw) return cached.value;
  const stored = parse<Household>(raw);
  const value = stored && stored.people.length > 0 ? stored : fromOldKeys();
  cached = { raw, value };
  return value;
}

function writeHousehold(next: Household): void {
  window.localStorage.setItem(HOUSEHOLD_KEY, JSON.stringify(next));
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

function activePerson(household: Household): Person {
  return household.people.find((person) => person.id === household.activeId) ?? household.people[0];
}

function updateActive(change: (person: Person) => Person): void {
  const household = readHousehold();
  const active = activePerson(household);
  writeHousehold({
    ...household,
    people: household.people.map((person) => (person.id === active.id ? change(person) : person)),
  });
}

function useHouseholdSnapshot(): Household {
  return useSyncExternalStore(subscribe, readHousehold, () => EMPTY_HOUSEHOLD);
}

export function useHousehold() {
  const household = useHouseholdSnapshot();
  const active = activePerson(household);
  const select = useCallback((id: string) => writeHousehold({ ...readHousehold(), activeId: id }), []);
  const addPerson = useCallback((name: string) => {
    const current = readHousehold();
    const trimmed = name.trim();
    if (trimmed === "" || current.people.length >= MAX_PEOPLE) return;
    const id = `p${Date.now().toString(36)}`;
    writeHousehold({ activeId: id, people: [...current.people, { ...EMPTY_PERSON, id, name: trimmed }] });
  }, []);
  const removeActive = useCallback(() => {
    const current = readHousehold();
    if (current.people.length <= 1) return;
    const people = current.people.filter((person) => person.id !== activePerson(current).id);
    writeHousehold({ activeId: people[0].id, people });
  }, []);
  return { people: household.people, active, select, addPerson, removeActive, canAdd: household.people.length < MAX_PEOPLE };
}

export function useCabinet() {
  const active = activePerson(useHouseholdSnapshot());
  const add = useCallback((product: Product) => {
    updateActive((person) =>
      person.cabinet.some((item) => item.id === product.id) ? person : { ...person, cabinet: [...person.cabinet, product] },
    );
  }, []);
  const remove = useCallback((id: string) => {
    updateActive((person) => {
      const supply = Object.fromEntries(Object.entries(person.supply).filter(([key]) => key !== id));
      return { ...person, cabinet: person.cabinet.filter((item) => item.id !== id), supply };
    });
  }, []);
  const replaceAll = useCallback((products: readonly Product[]) => {
    updateActive((person) => ({ ...person, cabinet: products, supply: {} }));
  }, []);
  return { items: active.cabinet, add, remove, replaceAll };
}

export function useProfile() {
  const active = activePerson(useHouseholdSnapshot());
  const save = useCallback((next: Profile) => updateActive((person) => ({ ...person, profile: next })), []);
  return { profile: active.profile, save };
}

export function useSupply() {
  const active = activePerson(useHouseholdSnapshot());
  const setSupply = useCallback((productId: string, next: Supply) => {
    updateActive((person) => ({ ...person, supply: { ...person.supply, [productId]: next } }));
  }, []);
  return { supply: active.supply, setSupply };
}
