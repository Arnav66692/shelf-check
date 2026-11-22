export type LessonQuote = {
  readonly text: string;
  readonly field: string;
  readonly sectionName: string;
};

export type LessonSectionId = "for" | "works" | "timing" | "take" | "food" | "side" | "rest" | "avoid";

export type LessonSection = {
  readonly id: LessonSectionId;
  readonly title: string;
  readonly quotes: readonly LessonQuote[];
};

export type LessonModel = "capsule" | "syringe" | "bottle";

export type Lesson = {
  readonly setId: string;
  readonly name: string;
  readonly genericName?: string;
  readonly substances: readonly string[];
  readonly activeIngredient?: LessonQuote;
  readonly kind: "otc" | "rx";
  readonly model: LessonModel;
  readonly recordUrl: string;
  readonly sections: readonly LessonSection[];
};

export type RawLabel = Readonly<Record<string, unknown>>;
