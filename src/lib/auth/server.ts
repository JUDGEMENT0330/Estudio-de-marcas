import "server-only";

import type { User } from "@/lib/db/types";
import { getLocalWorkspaceUser } from "./local-workspace";

export function getAuthErrorMessage(): string {
  return "Estudio de Marcas se ejecuta en modo espacio de trabajo. No requiere autenticación.";
}

export async function getCurrentUser(): Promise<User> {
  return getLocalWorkspaceUser();
}

export async function requireCurrentUser(): Promise<User> {
  return getLocalWorkspaceUser();
}
