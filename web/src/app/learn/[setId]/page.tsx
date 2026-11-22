import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RateLimitError } from "@lookup/errors.ts";
import { LessonView } from "@/components/learn/LessonView";
import { lessonForSetId } from "@/server/learn/label";
import type { Lesson } from "@/server/learn/types";

type Props = { params: Promise<{ setId: string }> };
type Loaded = { readonly lesson: Lesson } | { readonly problem: string };

const NOT_FOUND = "No FDA label was found for this code. The label may have been withdrawn or replaced.";

async function load(setId: string): Promise<Loaded> {
  try {
    const lesson = await lessonForSetId(decodeURIComponent(setId));
    return lesson ? { lesson } : { problem: NOT_FOUND };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { problem: "The official drug database has hit its request limit for now. Try again in a few minutes." };
    }
    console.error("label lesson failed", error);
    return { problem: "The FDA label service did not answer. Try again in a moment." };
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const loaded = await load((await params).setId);
  return { title: "lesson" in loaded ? `${loaded.lesson.name} | Learning center | Shelf Check` : "Learning center | Shelf Check" };
}

export const instant = false;

export default function LessonPage({ params }: Props) {
  return (
    <Suspense fallback={<p className="pt-6 text-ink-soft">Reading the FDA label.</p>}>
      <LessonContent params={params} />
    </Suspense>
  );
}

async function LessonContent({ params }: Props) {
  const loaded = await load((await params).setId);
  if ("lesson" in loaded) return <LessonView lesson={loaded.lesson} />;
  return (
    <section className="pt-6 max-w-2xl">
      <h1 className="text-3xl font-medium narrow">Could not open this label</h1>
      <p className="mt-4 facts" role="alert">
        {loaded.problem}
      </p>
      <p className="mt-4">
        <Link href="/learn" className="btn btn-quiet">
          Back to the learning center
        </Link>
      </p>
    </section>
  );
}
