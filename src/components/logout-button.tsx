"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/icon";

export function LogoutButton({ variant = "icon" }: { variant?: "icon" | "menu" }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  if (variant === "menu") {
    return <button type="button" className="simple-more-logout-button" aria-label="Sair da plataforma" onClick={logout}>Sair <Icon name="chevron" size={16}/></button>;
  }
  return <button type="button" className="icon-button" aria-label="Sair da plataforma" title="Sair" onClick={logout}><Icon name="logout"/></button>;
}
