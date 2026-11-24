"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  console.error(error);
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h2>Error inesperado</h2>
        <p>La aplicación tuvo un problema.</p>
        <button onClick={reset}>Reintentar</button>
      </body>
    </html>
  );
}
