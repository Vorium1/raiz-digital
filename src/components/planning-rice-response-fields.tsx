export type PlanningRiceResponseClass="MEDIA"|"ALTA"|"MUITO_ALTA";

export function PlanningRiceResponseFields({
  responseClass,
  approved,
  onChange,
}:{
  responseClass:PlanningRiceResponseClass|null;
  approved:boolean;
  onChange:(responseClass:PlanningRiceResponseClass|null,approved:boolean)=>void;
}){
  return <>
    <label>Classe de resposta SOSBAI
      <select
        value={responseClass??""}
        onChange={(event)=>{
          const value=event.currentTarget.value;
          onChange(
            value===""?null:value as PlanningRiceResponseClass,
            false,
          );
        }}
      >
        <option value="">Não resolvida</option>
        <option value="MEDIA">Média</option>
        <option value="ALTA">Alta</option>
        <option value="MUITO_ALTA">Muito alta</option>
      </select>
      <small>Não é inferida por meta, clima, preço ou investimento.</small>
    </label>

    <label>
      <span>
        <input
          type="checkbox"
          checked={approved}
          disabled={responseClass==null}
          onChange={(event)=>onChange(responseClass,event.currentTarget.checked)}
        />
        {" "}Classe revisada e aprovada pelo responsável técnico
      </span>
    </label>
  </>;
}
