import { Suspense } from "react";
import { CabinetView } from "@/components/CabinetView";

export default function CabinetPage() {
  return (
    <Suspense>
      <CabinetView />
    </Suspense>
  );
}
