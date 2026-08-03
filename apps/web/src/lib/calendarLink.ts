function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function toIcsDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(
    d.getUTCHours()
  )}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export function icsLink(opts: {
  start: string;
  end: string;
  titulo: string;
  descripcion?: string;
  ubicacion?: string;
  uid: string;
}): string {
  const start = new Date(opts.start);
  const end = new Date(opts.end);
  const dtstamp = new Date();
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Slotify//Bookings//EN",
    "BEGIN:VEVENT",
    `UID:${opts.uid}@slotify`,
    `DTSTAMP:${toIcsDate(dtstamp)}`,
    `DTSTART:${toIcsDate(start)}`,
    `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${opts.titulo}`,
    opts.descripcion ? `DESCRIPTION:${opts.descripcion.replace(/\n/g, "\\n")}` : "",
    opts.ubicacion ? `LOCATION:${opts.ubicacion}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}

export function googleCalendarLink(opts: {
  start: string;
  end: string;
  titulo: string;
  descripcion?: string;
  ubicacion?: string;
}): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: opts.titulo,
    dates: `${toIcsDate(new Date(opts.start))}/${toIcsDate(new Date(opts.end))}`,
  });
  if (opts.descripcion) params.set("details", opts.descripcion);
  if (opts.ubicacion) params.set("location", opts.ubicacion);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}