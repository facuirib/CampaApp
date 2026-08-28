import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // El default de Next.js es 1MB, insuficiente para adjuntar
      // fotos de comprobantes (una foto de celular tranquilamente
      // supera eso). 5MB da margen razonable sin abrir la puerta a
      // uploads gigantes.
      bodySizeLimit: '5mb',
    },
  },
};

export default nextConfig;
