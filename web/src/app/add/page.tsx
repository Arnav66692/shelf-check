import { Suspense } from "react";
import { AddView } from "@/components/AddView";

export default function AddPage() {
  return (
    <Suspense>
      <AddView />
    </Suspense>
  );
}
