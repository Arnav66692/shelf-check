import type { Metadata } from "next";
import { CareView } from "@/components/care/CareView";

export const metadata: Metadata = {
  title: "Find care near you | Shelf Check",
  description: "Find a pharmacy, urgent care or hospital near you, sorted by how you feel.",
};

export default function CarePage() {
  return <CareView />;
}
