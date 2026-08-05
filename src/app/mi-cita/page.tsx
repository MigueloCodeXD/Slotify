"use client";

import { Suspense } from "react";
import { MiCita } from "@/components/MiCita";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MiCita />
    </Suspense>
  );
}