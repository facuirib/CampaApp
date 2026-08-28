import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // El default de Next.js es 1MB, insuficiente para adjuntar fotos de
      // comprobantes (una foto de celular tranquilamente supera eso).
      //
      // Va UN MEGA POR ENCIMA del tope real del adjunto, que son 5 MB y vive en
      // la Server Action. No es redundancia: este límite corta el request ANTES
      // de que la acción se ejecute, y lo hace **sin mensaje** — la pantalla se
      // queda muda. Medido: con los dos en 5mb, un archivo de 6 MB se rechazaba
      // sin decir nada.
      //
      // Con el margen, un archivo que pasa los 5 MB llega a la acción y recibe
      // el mensaje que dice cuánto pesa y cuál es el máximo. Este queda como red
      // para lo absurdo, que es para lo que sirve un límite de framework.
      bodySizeLimit: '6mb',
    },
  },
};

export default nextConfig;
