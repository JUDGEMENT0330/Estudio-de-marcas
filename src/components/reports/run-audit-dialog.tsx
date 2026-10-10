"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DialogState = "ready" | "submitting" | "error";

interface RunAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessName: string;
  city: string;
}

export function RunAuditDialog({
  open,
  onOpenChange,
  businessName,
  city,
}: RunAuditDialogProps) {
  const router = useRouter();
  const [state, setState] = useState<DialogState>("ready");
  const [errorMsg, setErrorMsg] = useState("");

  const startAudit = useCallback(async () => {
    setState("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName,
          city,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "No se pudo iniciar la auditoría");
      }

      const data = await res.json();
      router.push(`/audits/${data.reportId}`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "No se pudo iniciar la auditoría");
      setState("error");
    }
  }, [businessName, city, router]);

  const closeDialog = (nextOpen: boolean) => {
    if (!nextOpen) {
      setState("ready");
      setErrorMsg("");
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={closeDialog}>
      <DialogContent className="sm:max-w-md">
        {state === "ready" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
                Ejecutar auditoría completa
              </DialogTitle>
              <DialogDescription>
                Inicia un análisis de inteligencia de 8 módulos para este negocio.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-sm text-slate-500 mb-0.5">Negocio</p>
                <p className="font-semibold text-slate-900">{businessName}</p>
                <p className="text-xs text-slate-500">{city}</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
                <Zap className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-900">
                    Ejecución en tu espacio de trabajo
                  </p>
                  <p className="text-xs text-blue-700 mt-0.5">
                    No requiere suscripción, cuenta de facturación ni créditos.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => closeDialog(false)}>
                Cancelar
              </Button>
              <Button onClick={startAudit} className="gap-1.5">
                <Zap className="h-4 w-4" />
                Iniciar auditoría
              </Button>
            </DialogFooter>
          </>
        )}

        {state === "submitting" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                Iniciando auditoría
              </DialogTitle>
              <DialogDescription>
                Preparando el análisis de inteligencia para {businessName}…
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          </>
        )}

        {state === "error" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-5 w-5" />
                Algo salió mal
              </DialogTitle>
              <DialogDescription>{errorMsg}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => closeDialog(false)}>
                Cerrar
              </Button>
              <Button onClick={startAudit}>Reintentar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
