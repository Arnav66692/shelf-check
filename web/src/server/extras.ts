import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  findRecalls,
  labelTagFlags,
  parseRecallFile,
  type CabinetItem,
  type LabelTag,
  type RecallFile,
  type RecallRecord,
} from "@engine/index.ts";
import type { Flag, FlagQuote } from "@/lib/model";

const RECALL_FILE = path.join(process.cwd(), "..", "engine", "data", "recalls.json");
const RECENT_YEARS = 3;
const TAG_TITLES: Record<LabelTag, string> = {
  alcohol: "Alcohol",
  grapefruit: "Grapefruit",
  drowsiness: "Drowsiness",
  sun: "Sun",
};

let recallFile: Promise<RecallFile> | undefined;

export function loadRecalls(): Promise<RecallFile> {
  recallFile ??= readFile(RECALL_FILE, "utf8").then((text) => parseRecallFile(JSON.parse(text)));
  recallFile.catch(() => {
    recallFile = undefined;
  });
  return recallFile;
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

function isCurrent(recall: RecallRecord, thisYear: number): boolean {
  return recall.status === "Ongoing" || thisYear - yearOf(recall.initiationDate) < RECENT_YEARS;
}

function recallFlag(item: CabinetItem, recall: RecallRecord): Flag {
  const ongoing = recall.status === "Ongoing";
  return {
    id: `recall:${item.id}:${recall.recallNumber}`,
    type: "recall",
    severity: ongoing ? "stop" : "info",
    title: `${ongoing ? "Recall under way" : "Past recall"} for ${item.displayName}`,
    explain: `The FDA lists recall ${recall.recallNumber} (${recall.classification}, ${recall.status.toLowerCase()}, started ${recall.initiationDate}) for this drug code. Only the listed lots are affected, so compare the lot number on your bottle.`,
    itemIds: [item.id],
    quotes: [
      { excerpt: `Reason: ${recall.reason}`, section: "fda_recall", itemId: item.id },
      { excerpt: `Lots: ${recall.codeInfo}`, section: "fda_recall", itemId: item.id },
    ],
  };
}

export async function recallFlags(items: readonly CabinetItem[]): Promise<readonly Flag[]> {
  const file = await loadRecalls();
  const thisYear = new Date().getFullYear();
  return items.flatMap((item) =>
    findRecalls(item, file.recalls)
      .map((match) => match.recall)
      .filter((recall) => isCurrent(recall, thisYear))
      .map((recall) => recallFlag(item, recall)),
  );
}

export function tagFlags(items: readonly CabinetItem[]): readonly Flag[] {
  const flags = labelTagFlags(items);
  const tags = [...new Set(flags.map((flag) => flag.tag).filter((tag): tag is LabelTag => tag !== undefined))];
  return tags.map((tag) => {
    const members = flags.filter((flag) => flag.tag === tag);
    const quotes: FlagQuote[] = members.flatMap((flag) =>
      flag.quote ? [{ excerpt: flag.quote.excerpt, section: flag.quote.section, itemId: flag.quote.itemId }] : [],
    );
    const itemIds = [...new Set(members.flatMap((flag) => flag.itemIds))];
    const stop = members.some((flag) => flag.severity === "stop");
    return {
      id: `tag:${tag}`,
      type: "label_tag",
      severity: stop ? "ask" : "info",
      title: TAG_TITLES[tag],
      explain: `${itemIds.length} of your labels ${itemIds.length === 1 ? "mentions" : "mention"} this. Read the quoted ${quotes.length === 1 ? "line" : "lines"}.`,
      itemIds,
      quotes,
    };
  });
}
