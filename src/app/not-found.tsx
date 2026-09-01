import Link from "next/link";

export default function NotFound() {
  return <main className="center-page"><div><span className="eyebrow">ERRO 404</span><h1>Esta área ainda não criou raízes.</h1><p>A página não existe ou foi movida.</p><Link className="button primary" href="/dashboard">Voltar ao início</Link></div></main>;
}
