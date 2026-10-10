"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Cloud, FileSearch, HardDrive, Plus, Settings } from "lucide-react";

interface SidebarProps {
  user: {
    name?: string;
    email: string;
  };
  runtime: {
    environment: "local" | "vercel";
    storage: "mysql" | "kv" | "sqlite" | "sqlite-efimero";
  };
}

const navigation = [
  { name: "Auditorías", href: "/audits", icon: FileSearch },
  { name: "Nueva auditoría", href: "/audits/new", icon: Plus },
  { name: "Configuración", href: "/settings", icon: Settings },
];

const STORAGE_LABEL: Record<SidebarProps["runtime"]["storage"], string> = {
  mysql: "MySQL (hosting)",
  kv: "Redis (KV)",
  sqlite: "SQLite",
  "sqlite-efimero": "SQLite temporal",
};

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/audits" className="press flex items-center gap-2.5 rounded-xl">
      {/* Altura fija y ancho automático: admite logos cuadrados u horizontales. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/escudo.png"
        alt="Cyber Valtorix"
        className={`${compact ? "h-7" : "h-[34px]"} w-auto max-w-[120px] object-contain drop-shadow-sm`}
      />
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">
          Estudio de Marcas
        </div>
        {!compact && (
          <div className="eyebrow text-brand-gold">Cyber Valtorix</div>
        )}
      </div>
    </Link>
  );
}

export function Sidebar({ user, runtime }: SidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/audits") {
      return pathname === "/audits" || (pathname?.startsWith("/audits/") && !pathname.startsWith("/audits/new"));
    }
    return pathname === href || pathname?.startsWith(href + "/");
  };

  const RuntimeIcon = runtime.environment === "vercel" ? Cloud : HardDrive;

  return (
    <>
      {/* Barra superior translúcida en móvil */}
      <header className="glass sticky top-0 z-40 border-b border-black/[0.06] md:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <BrandMark compact />
          <nav className="flex items-center gap-1">
            {navigation.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.name}
                  className={cn(
                    "press flex h-9 w-9 items-center justify-center rounded-full",
                    active ? "bg-primary text-white" : "text-foreground/70 hover:bg-secondary",
                  )}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Barra lateral en escritorio */}
      <aside className="glass hidden h-full w-[264px] shrink-0 flex-col border-r border-black/[0.06] md:flex">
        <div className="flex h-[72px] items-center px-5">
          <BrandMark />
        </div>

        <nav className="flex-1 space-y-0.5 px-3 py-4">
          <div className="eyebrow mb-2 px-3 text-muted-foreground">Espacio de trabajo</div>
          {navigation.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "press flex w-full items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium",
                  active
                    ? "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                    : "text-foreground/75 hover:bg-black/[0.04] hover:text-foreground",
                )}
              >
                <item.icon className="h-[17px] w-[17px] shrink-0" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-4 pb-3">
          <div className="rounded-2xl border border-black/[0.05] bg-white/60 p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow text-muted-foreground">Entorno</span>
              <RuntimeIcon className="h-4 w-4 text-primary" />
            </div>
            <dl className="space-y-1 text-[12px]">
              <div className="flex justify-between text-muted-foreground">
                <dt>Ejecución</dt>
                <dd className="font-medium text-foreground">
                  {runtime.environment === "vercel" ? "Vercel" : "Local"}
                </dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Almacenamiento</dt>
                <dd
                  className={cn(
                    "font-medium",
                    runtime.storage === "sqlite-efimero" ? "text-amber-700" : "text-foreground",
                  )}
                >
                  {STORAGE_LABEL[runtime.storage]}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="border-t border-black/[0.06] p-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-navy to-brand-blue text-[13px] font-semibold text-white">
              {(user.name || "C").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">
                {user.name || "Espacio de trabajo"}
              </p>
              <p className="truncate text-[12px] text-muted-foreground">{user.email}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
