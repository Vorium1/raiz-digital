export const SOIL_REANALYSIS_MAX_YEARS = 3;

export type SoilReanalysisTiming =
  | "UNKNOWN"
  | "CURRENT"
  | "DUE"
  | "INVALID_TEMPORAL_CONTEXT";

function parseDateOnly(value:string|null|undefined){
  if(!value)return null;
  const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if(!match)return null;
  const year=Number(match[1]);
  const month=Number(match[2]);
  const day=Number(match[3]);
  const date=new Date(Date.UTC(year,month-1,day));
  if(
    date.getUTCFullYear()!==year
    || date.getUTCMonth()!==month-1
    || date.getUTCDate()!==day
  ) return null;
  return {year,month,day,time:date.getTime()};
}

export function assessSoilReanalysisTiming(input:{
  baseEvidenceDate?:string|null;
  plannedDate?:string|null;
}):SoilReanalysisTiming{
  if(!input.baseEvidenceDate||!input.plannedDate)return "UNKNOWN";
  const base=parseDateOnly(input.baseEvidenceDate);
  const planned=parseDateOnly(input.plannedDate);
  if(!base||!planned)return "UNKNOWN";
  if(planned.time<base.time)return "INVALID_TEMPORAL_CONTEXT";

  const dueDate=new Date(Date.UTC(
    base.year+SOIL_REANALYSIS_MAX_YEARS,
    base.month-1,
    base.day,
  ));
  // 29/02 + 3 anos normaliza para março; a comparação continua conservadora e
  // usa aniversário civil, não um número inventado de dias.
  return planned.time>=dueDate.getTime()?"DUE":"CURRENT";
}
