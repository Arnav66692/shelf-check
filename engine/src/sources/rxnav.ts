import type { DrugClass } from "../types.ts";
import { createCachedJsonGetter, isRecord, recordArrayField, stringArrayField, stringField } from "./http.ts";
import type { FetchFn } from "./http.ts";

const RXNAV_BASE_URL = "https://rxnav.nlm.nih.gov/REST";
const STATUS_OK = 200;
const NORMALIZED_NAME_SEARCH = 2;

export interface RxConcept {
  readonly rxcui: string;
  readonly name: string;
}

export interface RxNavClient {
  findRxcui(name: string): Promise<string | null>;
  getBaseIngredients(rxcui: string): Promise<readonly RxConcept[]>;
  getClasses(rxcui: string, relaSource: string): Promise<readonly DrugClass[]>;
  getClassMembers(classId: string, relaSource: string): Promise<readonly RxConcept[]>;
}

export interface RxNavClientOptions {
  readonly fetch?: FetchFn;
}

function childRecord(parent: unknown, key: string): Record<string, unknown> {
  if (!isRecord(parent)) return {};
  const child = parent[key];
  return isRecord(child) ? child : {};
}

function toConcept(raw: Record<string, unknown>): RxConcept | null {
  const rxcui = stringField(raw, "rxcui");
  const name = stringField(raw, "name");
  return rxcui === undefined || name === undefined ? null : { rxcui, name };
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function uniqueBy<T>(values: readonly T[], keyOf: (value: T) => string): readonly T[] {
  return [...new Map(values.map((value) => [keyOf(value), value] as const)).values()];
}

// RxNorm sometimes files one name under two ingredient concepts ("vitamin D3" is both 2418 cholecalciferol and
// 1244014 vitamin D3). Always taking the older, lower-numbered concept makes every spelling land on the same one.
function lowestRxcui(ids: readonly string[]): string | undefined {
  return [...ids].sort((left, right) => Number(left) - Number(right)).at(0);
}

export function rxcuiUrl(name: string): string {
  return `${RXNAV_BASE_URL}/rxcui.json?name=${encodeURIComponent(name)}&search=${NORMALIZED_NAME_SEARCH}`;
}

export function baseIngredientUrl(rxcui: string): string {
  return `${RXNAV_BASE_URL}/rxcui/${encodeURIComponent(rxcui)}/related.json?tty=IN`;
}

export function classesUrl(rxcui: string, relaSource: string): string {
  return `${RXNAV_BASE_URL}/rxclass/class/byRxcui.json?rxcui=${encodeURIComponent(rxcui)}&relaSource=${encodeURIComponent(relaSource)}`;
}

export function classMembersUrl(classId: string, relaSource: string): string {
  return `${RXNAV_BASE_URL}/rxclass/classMembers.json?classId=${encodeURIComponent(classId)}&relaSource=${encodeURIComponent(relaSource)}`;
}

export function createRxNavClient(options: RxNavClientOptions = {}): RxNavClient {
  const getJson = createCachedJsonGetter({ fetch: options.fetch ?? fetch, acceptedStatuses: [STATUS_OK] });

  return {
    async findRxcui(name) {
      const { body } = await getJson(rxcuiUrl(name));
      const ids = stringArrayField(childRecord(body, "idGroup"), "rxnormId");
      return lowestRxcui(ids) ?? null;
    },
    async getBaseIngredients(rxcui) {
      const { body } = await getJson(baseIngredientUrl(rxcui));
      const groups = recordArrayField(childRecord(body, "relatedGroup"), "conceptGroup");
      return groups.flatMap((group) => recordArrayField(group, "conceptProperties").map(toConcept).filter(isPresent));
    },
    async getClasses(rxcui, relaSource) {
      const { body } = await getJson(classesUrl(rxcui, relaSource));
      const infos = recordArrayField(childRecord(body, "rxclassDrugInfoList"), "rxclassDrugInfo");
      const classes = infos.flatMap((info) => {
        if (stringField(childRecord(info, "minConcept"), "rxcui") !== rxcui) return [];
        const item = childRecord(info, "rxclassMinConceptItem");
        const id = stringField(item, "classId");
        const name = stringField(item, "className");
        const type = stringField(item, "classType");
        return id === undefined || name === undefined || type === undefined ? [] : [{ id, name, type, source: relaSource }];
      });
      return uniqueBy(classes, (drugClass) => drugClass.id);
    },
    async getClassMembers(classId, relaSource) {
      const { body } = await getJson(classMembersUrl(classId, relaSource));
      const members = recordArrayField(childRecord(body, "drugMemberGroup"), "drugMember");
      const concepts = members.map((member) => toConcept(childRecord(member, "minConcept"))).filter(isPresent);
      return uniqueBy(concepts, (concept) => concept.rxcui);
    },
  };
}
