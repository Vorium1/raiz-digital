import { redirect } from "next/navigation";

export const metadata = { title: "Início" };

export default function DashboardPage() {
  redirect("/inicio");
}
