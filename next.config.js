/** @type {import('next').NextConfig} */
const path = require("path");

const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // Módulos nativos / pesados que deben quedarse fuera del bundle del servidor.
  serverExternalPackages: ["better-sqlite3", "@react-pdf/renderer"],
  // Incluye los logos de marca en las funciones que generan documentos.
  outputFileTracingIncludes: {
    "/api/report/[id]/*": ["./public/brand/**/*"],
  },
};

module.exports = nextConfig;
