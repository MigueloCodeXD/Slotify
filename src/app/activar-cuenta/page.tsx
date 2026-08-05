"use client";

import { Suspense } from "react";
import { ActivarCuenta } from "@/components/ActivarCuenta";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ActivarCuenta />
    </Suspense>
  );
}