import { redirect } from "next/navigation";

export const metadata = { title: "Resultados" };

export default function RevisarPage() {
  redirect("/resultados");
}
