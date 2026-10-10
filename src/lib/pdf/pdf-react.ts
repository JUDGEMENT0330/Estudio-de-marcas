import * as BundledReact from "react";

/**
 * @react-pdf/renderer se ejecuta como paquete externo (se carga con el
 * require real de Node desde node_modules), pero el JSX de la app se compila
 * contra el React interno de Next. Si los elementos del PDF se crean con un
 * React distinto al del reconciliador de @react-pdf, el render falla
 * (React error #31). Por eso report-pdf.tsx usa como pragma JSX el mismo
 * React que obtiene @react-pdf en tiempo de ejecución.
 */
declare const __non_webpack_require__: NodeJS.Require | undefined;

type ReactModule = typeof BundledReact;

function loadPdfReact(): ReactModule {
  try {
    if (typeof __non_webpack_require__ === "function") {
      return __non_webpack_require__("react") as ReactModule;
    }
  } catch {
    // usar el React empaquetado
  }
  const mod = BundledReact as ReactModule & { default?: ReactModule };
  return typeof mod.createElement === "function" ? mod : (mod.default as ReactModule);
}

export const PdfReact = loadPdfReact();
export const h = ((...args: unknown[]) =>
  (PdfReact.createElement as (...a: unknown[]) => unknown)(...args)) as unknown as ReactModule["createElement"];
export const Fragment = PdfReact.Fragment;
