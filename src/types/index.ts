export interface Config {
  nombre_negocio: string;
  zona_horaria: string;
  margen_anticipacion_horas: number;
  horas_limite_cancelacion: number;
  direccion: string | null;
}

export interface ProfesionalPublico {
  id: string;
  nombre: string;
  foto_url: string | null;
}

export interface ServicioPublico {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  precio: number;
  duracion_min: number;
  buffer_min: number;
  activo: boolean;
  profesionales_ids: string[];
}

export interface Slot {
  start: string;
  end: string;
}

export interface MisCitasResponse {
  citas: CitaCliente[];
  avisos: Record<string, Aviso[]>;
}

export interface CitaCliente {
  id: string;
  estado: "confirmada" | "cancelada" | "completada" | "no_show" | "pendiente";
  rango_tiempo: { start: string; end: string };
  notas: string | null;
  confirmacion_pendiente?: boolean | null;
  confirmacion_expira_at?: string | null;
  precio_servicio?: number | null;
  anticipo?: number | null;
  estado_pago?: "pendiente" | "parcial" | "pagado" | null;
  token_gestion: string;
  servicio: ServicioPublico | null;
  profesional: ProfesionalPublico | null;
}

export interface Aviso {
  id: string;
  mensaje: string;
  created_at: string;
}

export interface Profesional {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  foto_url: string | null;
  rol: "admin" | "profesional";
  activo: boolean;
  cedula?: string | null;
}

export interface Servicio {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  precio: number;
  duracion_min: number;
  buffer_min: number;
  activo: boolean;
  profesionales_ids: string[];
}

export interface CitaProfesional {
  id: string;
  profesional_id: string;
  estado: "confirmada" | "cancelada" | "completada" | "no_show" | "pendiente";
  start: string;
  end: string;
  notas: string | null;
  confirmacion_pendiente?: boolean | null;
  precio_servicio?: number | null;
  duracion_min_servicio?: number | null;
  servicio: { id: string; nombre: string; duracion_min: number };
  cliente: { id: string; nombre: string; email: string; telefono: string | null };
}

export interface Bloqueo {
  id: string;
  profesional_id: string;
  start: string;
  end: string;
  motivo: string | null;
}