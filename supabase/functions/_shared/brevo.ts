export type EmailTipo =
  | "cita_creada_cliente"
  | "cita_creada_profesional"
  | "cita_modificada_cliente"
  | "cita_modificada_profesional"
  | "cita_cancelada_cliente"
  | "cita_cancelada_profesional"
  | "cita_pendiente_confirmacion_cliente"
  | "codigo_acceso_cliente"
  | "invitacion_profesional"
  | "aviso_profesional_cliente"
  | "resumen_matutino"
  | "recordatorio_cita_cliente"
  | "recordatorio_cita_profesional";

export interface DatosEmail {
  to: string;
  [key: string]: unknown;
}

function formatFecha(iso: string | Date): string {
  return new Intl.DateTimeFormat("es", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Bogota",
  }).format(new Date(iso));
}

function plantilla(body: string, titulo: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f0fa;font-family:Arial,Helvetica,sans-serif;color:#2a2240">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f0fa;padding:24px 0">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e6e0f5">
        <tr>
          <td style="background:linear-gradient(135deg,#6d28d9,#a855f7);padding:24px 32px">
            <h1 style="margin:0;color:#ffffff;font-size:22px">${titulo}</h1>
          </td>
        </tr>
        <tr><td style="padding:32px">${body}</td></tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #eee;color:#8a84a0;font-size:12px">
            <strong>Slotify</strong> — Este correo fue enviado automáticamente. No respondas a este mensaje.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function construirEmail(tipo: EmailTipo, datos: DatosEmail): {
  subject: string;
  html: string;
} {
  const { negocio = "Slotify" } = datos;
  switch (tipo) {
    case "cita_creada_cliente": {
      const subject = `Cita confirmada — ${datos.servicio}`;
      const html = plantilla(`
        <p>Hola <strong>{{nombre}}</strong>, tu cita quedó confirmada:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6fc;border-radius:12px;padding:16px;margin:16px 0">
          <tr><td style="padding:4px 0;color:#6b6480">Servicio</td><td style="padding:4px 0;font-weight:bold">{{servicio}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Profesional</td><td style="padding:4px 0;font-weight:bold">{{profesional}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Fecha</td><td style="padding:4px 0;font-weight:bold">{{fecha}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Dirección</td><td style="padding:4px 0;font-weight:bold">{{direccion}}</td></tr>
        </table>
        <p>Puedes ver, cancelar o reprogramar tu cita desde el siguiente enlace:</p>
        <p><a href="{{link_gestion}}" style="display:inline-block;background:#6d28d9;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none">Gestionar mi cita</a></p>
        <p>Si prefieres no usarlo, tu cita está agendada sin acciones adicionales.</p>
      `, `Confirmación de cita · ${negocio}`);
      return { subject, html };
    }
    case "cita_creada_profesional": {
      const subject = `Nueva cita — ${datos.cliente}`;
      const html = plantilla(`
        <p>Tienes una nueva cita:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6fc;border-radius:12px;padding:16px;margin:16px 0">
          <tr><td style="padding:4px 0;color:#6b6480">Cliente</td><td style="padding:4px 0;font-weight:bold">{{cliente}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Servicio</td><td style="padding:4px 0;font-weight:bold">{{servicio}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Fecha</td><td style="padding:4px 0;font-weight:bold">{{fecha}}</td></tr>
        </table>
      `, `Nueva cita agendada · ${negocio}`);
      return { subject, html };
    }
    case "cita_modificada_cliente": {
      const subject = `Tu cita fue modificada — ${datos.servicio}`;
      const html = plantilla(`
        <p>Hola <strong>{{nombre}}</strong>, tu cita fue reprogramada:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6fc;border-radius:12px;padding:16px;margin:16px 0">
          <tr><td style="padding:4px 0;color:#6b6480">Servicio</td><td style="padding:4px 0;font-weight:bold">{{servicio}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Profesional</td><td style="padding:4px 0;font-weight:bold">{{profesional}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Nueva fecha</td><td style="padding:4px 0;font-weight:bold">{{fecha}}</td></tr>
        </table>
        <p><a href="{{link_gestion}}" style="display:inline-block;background:#6d28d9;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none">Gestionar mi cita</a></p>
      `, `Cita reprogramada · ${negocio}`);
      return { subject, html };
    }
    case "cita_modificada_profesional": {
      const subject = `Cita modificada — ${datos.cliente}`;
      const html = plantilla(`
        <p>La cita con <strong>{{cliente}}</strong> fue reprogramada:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6fc;border-radius:12px;padding:16px;margin:16px 0">
          <tr><td style="padding:4px 0;color:#6b6480">Servicio</td><td style="padding:4px 0;font-weight:bold">{{servicio}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Nueva fecha</td><td style="padding:4px 0;font-weight:bold">{{fecha}}</td></tr>
        </table>
      `, `Cita reprogramada · ${negocio}`);
      return { subject, html };
    }
    case "cita_cancelada_cliente": {
      const subject = `Tu cita fue cancelada — ${datos.servicio}`;
      const html = plantilla(`
        <p>Hola <strong>{{nombre}}</strong>, tu cita fue cancelada.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6fc;border-radius:12px;padding:16px;margin:16px 0">
          <tr><td style="padding:4px 0;color:#6b6480">Servicio</td><td style="padding:4px 0;font-weight:bold">{{servicio}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Profesional</td><td style="padding:4px 0;font-weight:bold">{{profesional}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Fecha</td><td style="padding:4px 0;font-weight:bold">{{fecha}}</td></tr>
        </table>
        <p>Si fue un error, puedes agendar una nueva cita cuando quieras.</p>
      `, `Cita cancelada · ${negocio}`);
      return { subject, html };
    }
    case "cita_cancelada_profesional": {
      const subject = `Cita cancelada — ${datos.cliente}`;
      const html = plantilla(`
        <p>La cita con <strong>{{cliente}}</strong> fue cancelada:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6fc;border-radius:12px;padding:16px;margin:16px 0">
          <tr><td style="padding:4px 0;color:#6b6480">Servicio</td><td style="padding:4px 0;font-weight:bold">{{servicio}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Fecha</td><td style="padding:4px 0;font-weight:bold">{{fecha}}</td></tr>
        </table>
      `, `Cita cancelada · ${negocio}`);
      return { subject, html };
    }
    case "cita_pendiente_confirmacion_cliente": {
      const subject = `Confirma tu cita — ${datos.servicio}`;
      const html = plantilla(`
        <p>Hola <strong>{{nombre}}</strong>, el profesional te agendó una cita que está <strong>pendiente de confirmación</strong>:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6fc;border-radius:12px;padding:16px;margin:16px 0">
          <tr><td style="padding:4px 0;color:#6b6480">Servicio</td><td style="padding:4px 0;font-weight:bold">{{servicio}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Profesional</td><td style="padding:4px 0;font-weight:bold">{{profesional}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Fecha</td><td style="padding:4px 0;font-weight:bold">{{fecha}}</td></tr>
        </table>
        <p>Confirma para reservar tu horario. Si no confirmas antes del vencimiento, la cita se liberará automáticamente.</p>
        <p><a href="{{link_confirmar}}" style="display:inline-block;background:#6d28d9;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none">Confirmar mi cita</a></p>
        <p style="font-size:12px;color:#8880a0">¿Cambió tu plan? <a href="{{link_gestion}}" style="color:#6d28d9">Gestiona tu cita aquí</a>.</p>
      `, `Confirma tu cita · ${negocio}`);
      return { subject, html };
    }
    case "codigo_acceso_cliente": {
      const subject = `Tu código de acceso · ${negocio}`;
      const html = plantilla(`
        <p>Hola <strong>{{nombre}}</strong>, usá el siguiente código para entrar a tus citas:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center;margin:24px 0;color:#6d28d9">{{codigo}}</p>
        <p>El código expira en <strong>15 minutos</strong>. Si no lo solicitaste, ignorá este correo.</p>
      `, `Tu código de acceso · ${negocio}`);
      return { subject, html };
    }
    case "invitacion_profesional": {
      const subject = `Te invitaron a ${negocio}`;
      const html = plantilla(`
        <p>Hola <strong>{{nombre}}</strong>, te invitaron a unirte como profesional en <strong>{{negocio}}</strong>.</p>
        <p>Activa tu cuenta y define tu contraseña con el siguiente enlace:</p>
        <p><a href="{{link_activacion}}" style="display:inline-block;background:#6d28d9;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none">Activar mi cuenta</a></p>
        <p>Este enlace es de un solo uso y expira en 48 horas.</p>
      `, `Invitación · ${negocio}`);
      return { subject, html };
    }
    case "aviso_profesional_cliente": {
      const subject = `Un mensaje sobre tu cita · ${negocio}`;
      const html = plantilla(`
        <p>Hola <strong>{{nombre}}</strong>, tienes un mensaje sobre tu cita:</p>
        <blockquote style="border-left:4px solid #a855f7;margin:16px 0;padding:12px 16px;background:#f8f6fc">{{mensaje}}</blockquote>
        <p><a href="{{link_gestion}}" style="display:inline-block;background:#6d28d9;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none">Ver mi cita</a></p>
      `, `Mensaje sobre tu cita · ${negocio}`);
      return { subject, html };
    }
    case "resumen_matutino": {
      const subject = `Resumen del día · ${negocio}`;
      const html = plantilla(`
        <p>Hola <strong>{{nombre}}</strong>, este es el resumen de tus citas de hoy:</p>
        ${datos.htmlCitas}
      `, `Resumen del día · ${negocio}`);
      return { subject, html };
    }
    case "recordatorio_cita_cliente": {
      const subject = `Recordatorio de tu cita · ${negocio}`;
      const html = plantilla(`
        <p>Hola <strong>{{nombre}}</strong>, te recordamos tu próxima cita:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6fc;border-radius:12px;padding:16px;margin:16px 0">
          <tr><td style="padding:4px 0;color:#6b6480">Servicio</td><td style="padding:4px 0;font-weight:bold">{{servicio}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Profesional</td><td style="padding:4px 0;font-weight:bold">{{profesional}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Fecha</td><td style="padding:4px 0;font-weight:bold">{{fecha}}</td></tr>
        </table>
        <p>Si no puedes asistir, avísanos desde el siguiente enlace:</p>
        <p><a href="{{link_gestion}}" style="display:inline-block;background:#6d28d9;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none">Gestionar mi cita</a></p>
      `, `Recordatorio · ${negocio}`);
      return { subject, html };
    }
    case "recordatorio_cita_profesional": {
      const subject = `Recordatorio: cita de {{cliente}} · ${negocio}`;
      const html = plantilla(`
        <p>Hola <strong>{{nombre}}</strong>, recuerda que tienes una cita:</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8f6fc;border-radius:12px;padding:16px;margin:16px 0">
          <tr><td style="padding:4px 0;color:#6b6480">Cliente</td><td style="padding:4px 0;font-weight:bold">{{cliente}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Servicio</td><td style="padding:4px 0;font-weight:bold">{{servicio}}</td></tr>
          <tr><td style="padding:4px 0;color:#6b6480">Fecha</td><td style="padding:4px 0;font-weight:bold">{{fecha}}</td></tr>
        </table>
      `, 'Recordatorio de cita · ' + negocio);
      return { subject, html };
    }
  }
}

function escaparHTML(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function enviarCorreo(tipo: EmailTipo, datos: DatosEmail): Promise<void> {
  const brevoKey = Deno.env.get("BREVO_API_KEY");
  const fromEmail = Deno.env.get("BREVO_FROM_EMAIL") ?? "miguebermudez77@gmail.com";
  if (!brevoKey) {
    console.error("BREVO_API_KEY no configurada; correo omitido:", tipo);
    return;
  }
  const { subject, html } = construirEmail(tipo, datos);

  // Interpola {{clave}} con los datos reales antes de enviar, para que los
  // valores no queden vacíos (Brevo SMTP no rellena placeholders por sí solo).
  const variables = { ...datos, negocio: datos.negocio ?? "Slotify" };
  const render = (s: string): string =>
    s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
      if (k === "fecha" && variables[k]) {
        try {
          return formatFecha(variables[k] as string | Date);
        } catch {
          return escaparHTML(variables[k]);
        }
      }
      return escaparHTML(variables[k]);
    });
  const htmlFinal = render(html);
  const subjectFinal = render(subject);

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": brevoKey,
    },
    body: JSON.stringify({
      sender: { name: "Slotify", email: fromEmail },
      to: [{ email: String(datos.to) }],
      subject: subjectFinal,
      htmlContent: htmlFinal,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Brevo error ${res.status}:`, body.slice(0, 500));
    throw new Error(`Error enviando correo (${tipo}): ${res.status}`);
  }
}

export { formatFecha, plantilla };
