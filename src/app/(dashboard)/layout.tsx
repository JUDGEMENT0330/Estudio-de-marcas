import { Sidebar } from "@/components/dashboard/sidebar";
import { requireCurrentUser } from "@/lib/auth/server";
import { getStorageBackend, isVercel } from "@/lib/runtime";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCurrentUser();
  const storage = getStorageBackend();

  return (
    <div className="flex min-h-screen flex-col md:h-screen md:flex-row">
      <Sidebar
        user={{
          name: user.name,
          email: user.email,
        }}
        runtime={{
          environment: isVercel() ? "vercel" : "local",
          storage,
        }}
      />
      <main className="flex-1 md:overflow-auto">
        {storage === "sqlite-efimero" && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-[13px] text-amber-900 md:px-8">
            Almacenamiento temporal: en Vercel los reportes se pierden al reiniciarse la función.
            Conecta Upstash Redis (KV) desde el Marketplace de Vercel para guardarlos de forma permanente.
          </div>
        )}
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:px-10 md:py-10">
          {children}
        </div>
      </main>
    </div>
  );
}
