"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return <button type="button" className="icon-button" aria-label="Sair da plataforma" title="Sair" onClick={logout}><Icon name="logout"/></button>;
}
