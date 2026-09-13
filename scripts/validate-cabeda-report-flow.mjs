/**
 * Compatibilidade com o comando legado.
 *
 * O script anterior hardcodava o UUID da análise, aprovava uma interpretação em nome do responsável
 * técnico e publicava relatório automaticamente. Isso não é um teste idempotente nem respeita a
 * governança atual. O ensaio seguro localiza AN-CABEDA-01 dinamicamente e nunca executa aprovações ou
 * publicação automática.
 */
console.warn("validate-cabeda-report-flow.mjs foi substituído pelo ensaio seguro rehearse-cabeda-area01.mjs.");
await import("./rehearse-cabeda-area01.mjs");
