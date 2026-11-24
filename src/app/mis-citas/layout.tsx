import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mis citas",
  description: "Consulta y gestiona tus citas agendadas.",
};

export default function MisCitasLayout({ children }: { children: React.ReactNode }) {
  return children;
}
