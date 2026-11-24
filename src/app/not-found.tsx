import Link from "next/link";
import { Tarjeta } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Tarjeta className="w-full max-w-md p-8 text-center">
        <h1 className="text-2xl font-bold text-zinc-900">Página no encontrada</h1>
        <p className="mt-2 text-sm text-zinc-500">La página que buscas no existe o fue movida.</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-[var(--primary-600)] px-4 py-2 text-sm font-semibold text-white">
          Ir al inicio
        </Link>
      </Tarjeta>
    </main>
  );
}
