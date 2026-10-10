#!/usr/bin/env node
/**
 * Reemplaza el logo de la app y de los documentos exportados.
 *
 *   npm run brand:logo -- ruta/al/logo.png
 *
 * Requisitos: PNG (idealmente con fondo transparente, mínimo 300 px de alto).
 * Copia el archivo a public/brand/escudo.png (encabezados, portadas, barra
 * lateral) y a src/app/icon.png y src/app/apple-icon.png (ícono del navegador).
 */
import fs from "node:fs";
import path from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("Uso: npm run brand:logo -- ruta/al/logo.png");
  process.exit(1);
}

const data = fs.readFileSync(path.resolve(source));
const isPng = data.length > 24 && data.readUInt32BE(0) === 0x89504e47 && data.readUInt32BE(12) === 0x49484452;
if (!isPng) {
  console.error("El logo debe ser un archivo PNG (los documentos Word, PowerPoint y PDF lo requieren).");
  process.exit(1);
}

const width = data.readUInt32BE(16);
const height = data.readUInt32BE(20);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const targets = ["public/brand/escudo.png", "src/app/icon.png", "src/app/apple-icon.png"];
for (const target of targets) {
  fs.writeFileSync(path.join(root, target), data);
  console.log(`✓ ${target}`);
}
console.log(`Logo actualizado (${width}×${height} px, proporción ${(width / height).toFixed(2)}).`);
if (height < 200) console.warn("Aviso: el logo es pequeño; en la portada puede verse pixelado. Usa al menos 300 px de alto.");
