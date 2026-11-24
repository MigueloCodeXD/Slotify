import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Iniciar sesión",
  description: "Accede al panel profesional de Slotify.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
