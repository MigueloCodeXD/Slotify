import { Navbar } from "@/components/Navbar";
import { HomeCatalogo } from "@/components/HomeCatalogo";
import { obtenerConfig } from "@/lib/server/config";
import { aplicarTema } from "@/lib/theme";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Home() {
  const config = await obtenerConfig();
  if (config?.color_principal) {
    aplicarTema(config.color_principal);
  }

  const logo = config?.logo_url?.trim() || "/logo.png";
  const nombre = config?.nombre_negocio?.trim() || "Slotify";

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar initialConfig={config} />
      <HomeCatalogo config={config} initialLogo={logo} initialNombre={nombre} />
    </div>
  );
}
