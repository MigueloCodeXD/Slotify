import { EmailGate } from "@/components/EmailGate";
import { PanelCalendario } from "@/components/PanelCalendario";

export default function Page() {
  return (
    <EmailGate>
      <PanelCalendario />
    </EmailGate>
  );
}
