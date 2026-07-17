// Fixtures deterministas de imágenes (024) — buffers mínimos con magic-bytes REALES por tipo, para
// ejercitar la validación de contenido real (FR-019: magic-bytes / decodificación, no solo el
// content_type declarado). No son imágenes "bonitas" (no hace falta que rendericen), pero SÍ llevan
// la cabecera binaria correcta de cada formato: JPEG (SOI/EOI), PNG (firma de 8 bytes), WEBP
// (RIFF....WEBP), HEIC (caja ISO-BMFF `ftyp` con marca `heic`).

export const MAX_SIZE_BYTES = 26_214_400; // 25 MiB (contrato EvidenceRef.size_bytes máximo)

function filler(size: number, byte: number): Buffer {
  return Buffer.alloc(size, byte);
}

/** JPEG válido: SOI (FFD8) + APP0 + relleno + EOI (FFD9). */
export function validJpeg(fillSize = 256): Buffer {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]),
    filler(fillSize, 0xaa),
    Buffer.from([0xff, 0xd9]),
  ]);
}

/** PNG válido: firma de 8 bytes + relleno (suficiente para la detección de magic-bytes). */
export function validPng(fillSize = 256): Buffer {
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), filler(fillSize, 0x11)]);
}

/** WEBP válido: contenedor RIFF con FourCC WEBP en el offset 8. */
export function validWebp(fillSize = 256): Buffer {
  const riff = Buffer.from('RIFF', 'ascii');
  const size = Buffer.alloc(4);
  size.writeUInt32LE(fillSize + 4, 0);
  const webp = Buffer.from('WEBP', 'ascii');
  return Buffer.concat([riff, size, webp, filler(fillSize, 0x22)]);
}

/** HEIC válido: caja ISO-BMFF `ftyp` con marca mayor `heic` (research.md/data-model: detección por `ftyp`). */
export function validHeic(fillSize = 256): Buffer {
  const boxSize = Buffer.alloc(4);
  boxSize.writeUInt32BE(24, 0);
  const ftyp = Buffer.from('ftyp', 'ascii');
  const majorBrand = Buffer.from('heic', 'ascii');
  const minorVersion = Buffer.alloc(4, 0);
  const compatBrand = Buffer.from('mif1', 'ascii');
  return Buffer.concat([boxSize, ftyp, majorBrand, minorVersion, compatBrand, filler(fillSize, 0x33)]);
}

/** Garbage sin magic-bytes reconocibles de ningún tipo de la allowlist (contenido "falseado/corrupto"). */
export function corruptBytes(size = 128): Buffer {
  return Buffer.alloc(size, 0x00);
}

/** 0 bytes — debe rechazarse por tamaño (413), nunca llega a validarse el contenido. */
export const emptyBuffer = Buffer.alloc(0);

/** > 25 MiB — debe rechazarse por tamaño (413) por streaming, aunque la cabecera JPEG sea válida. */
export function oversizedJpeg(): Buffer {
  const body = filler(MAX_SIZE_BYTES + 1024, 0xaa);
  body[0] = 0xff;
  body[1] = 0xd8;
  body[2] = 0xff;
  body[3] = 0xe0;
  return body;
}
