import type { Metadata } from "next";
import { LearnIndex } from "@/components/learn/LearnIndex";

export const metadata: Metadata = {
  title: "Learning center | Shelf Check",
  description: "Read what the official FDA label says about each medicine in your cabinet.",
};

export default function LearnPage() {
  return <LearnIndex />;
}
