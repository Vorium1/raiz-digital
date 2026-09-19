import Link from "next/link";
import { Icon } from "@/components/icon";
import { SimpleSendFlow } from "@/components/simple-send-flow";

export const metadata = { title: "Enviar dados" };

export default function EnviarPage() {
  return (
    <div className="simple-send-page">
      <div className="simple-send-back"><Link href="/inicio"><Icon name="arrow" size={15}/> Início</Link></div>
      <header className="simple-send-page-head">
        <span>ENVIAR DADOS</span>
        <h1>Envie. A RAIZ faz o restante.</h1>
        <p>Você só precisa mandar o arquivo e dizer de qual área ele é.</p>
      </header>
      <SimpleSendFlow/>
      <details className="simple-send-advanced"><summary>Precisa de opções avançadas?</summary><div><p>O fluxo técnico completo continua disponível para casos especiais.</p><Link href="/analises/nova?etapa=laudo&nivel=interpretacao-rapida">Abrir modo avançado <Icon name="arrow" size={13}/></Link></div></details>
    </div>
  );
}
