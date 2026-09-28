import type { VigorZone } from "@/domain/ndvi-engine";

/**
 * Paleta de EXIBIÇÃO do NDVI.
 *
 * O raster arquivado continua imutável e validado pelo SHA-256 original. Esta paleta só remapeia
 * as cinco cores categóricas no navegador para aumentar contraste visual sem alterar classes,
 * limites, estatísticas ou o artefato histórico persistido.
 */
export const NDVI_DISPLAY_ZONE_COLOR: Record<VigorZone, string> = {
  SEM_VEGETACAO: "#8D6E4F",
  BAIXO: "#E53935",
  MODERADO: "#F9A825",
  ALTO: "#7AC943",
  MUITO_ALTO: "#00A651",
};

const SOURCE_TO_DISPLAY = new Map<string, readonly [number, number, number]>([
  ["154,132,104", [141, 110, 79]],
  ["217,101,90", [229, 57, 53]],
  ["216,153,67", [249, 168, 37]],
  ["143,191,107", [122, 201, 67]],
  ["41,150,111", [0, 166, 81]],
]);

/**
 * Gera somente uma cópia temporária para apresentação. Se o navegador não oferecer Canvas/
 * createImageBitmap, devolve o PNG original sem falhar a evidência.
 */
export async function enhanceArchivedNdviRasterForDisplay(blob: Blob): Promise<Blob> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return blob;

  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close?.();
      return blob;
    }

    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = image.data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 0) continue;
      const replacement = SOURCE_TO_DISPLAY.get(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
      if (!replacement) continue;
      pixels[index] = replacement[0];
      pixels[index + 1] = replacement[1];
      pixels[index + 2] = replacement[2];
    }
    context.putImageData(image, 0, 0);

    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((next) => resolve(next ?? blob), "image/png");
    });
  } catch {
    return blob;
  }
}
