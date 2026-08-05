import { Suspense } from "react";
import { Agendar } from "@/components/Agendar";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Agendar />
    </Suspense>
  );
}