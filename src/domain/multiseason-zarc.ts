export type AgritecMunicipalityLike={
  ibgeCode:string;
  name:string;
  stateCode:string;
  latitude:number|null;
  longitude:number|null;
  updatedOn:string|null;
};

export type AgritecCultureLike={
  id:number;
  name:string;
  fullName:string;
  seasonLabel:string|null;
  cultivation:string|null;
  climate:string|null;
  hasZoning:boolean;
  updatedOn:string|null;
};

export type AgritecZarcWindowLike={
  municipalityName:string;
  stateCode:string;
  cropName:string;
  cycleLabel:string;
  soilLabel:string;
  startDay:number;
  startMonth:number;
  endDay:number;
  endMonth:number;
  seasonStartYear:number;
  seasonEndYear:number;
  riskPct:20|30|40;
  ordinance:string;
};

function normalizedOfficialName(value:string){
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .trim()
    .replace(/\s+/g," ")
    .toUpperCase();
}

export type AgritecMunicipalityResolution =
  | {status:"READY";municipality:AgritecMunicipalityLike;warnings:string[]}
  | {status:"NO_MATCH"|"AMBIGUOUS";municipality:null;warnings:string[]};

export function resolveAgritecMunicipalityExact(input:{
  municipalities:AgritecMunicipalityLike[];
  municipalityName:string;
  stateCode:string;
}):AgritecMunicipalityResolution{
  const state=input.stateCode.trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(state))throw new Error("AGRITEC_UF_INVALID");
  const name=normalizedOfficialName(input.municipalityName);
  if(!name)throw new Error("AGRITEC_MUNICIPALITY_NAME_REQUIRED");
  const matches=input.municipalities.filter((item)=>
    item.stateCode===state&&normalizedOfficialName(item.name)===name
  );
  const ibgeCodes=[...new Set(matches.map((item)=>item.ibgeCode))];
  if(matches.length&&ibgeCodes.length===1){
    return {status:"READY",municipality:matches[0],warnings:[]};
  }
  return {
    status:matches.length?"AMBIGUOUS":"NO_MATCH",
    municipality:null,
    warnings:[matches.length
      ?"AGRITEC_MUNICIPALITY_EXACT_MATCH_AMBIGUOUS"
      :"AGRITEC_MUNICIPALITY_EXACT_MATCH_NOT_FOUND"],
  };
}

const PLANNING_CROP_TO_AGRITEC_BASE:Record<string,string>={
  SOYBEAN:"SOJA",
  SOJA:"SOJA",
  WHEAT:"TRIGO",
  TRIGO:"TRIGO",
  RICE:"ARROZ",
  ARROZ:"ARROZ",
};

function cultureBaseNames(culture:AgritecCultureLike){
  const cultivation=normalizedOfficialName(culture.cultivation??"");
  return [...new Set([culture.name,culture.fullName].map((raw)=>{
    const name=normalizedOfficialName(raw);
    if(cultivation&&name.endsWith(` ${cultivation}`)){
      return name.slice(0,-(cultivation.length+1)).trim();
    }
    return name;
  }))];
}

function cultivationMatches(culture:AgritecCultureLike,irrigated:boolean|null|undefined){
  if(irrigated==null)return true;
  const cultivation=normalizedOfficialName(culture.cultivation??"");
  if(irrigated)return cultivation==="IRRIGADO"||cultivation.startsWith("IRRIGADO ");
  return cultivation==="SEQUEIRO";
}

export type AgritecCultureResolution =
  | {status:"READY";culture:AgritecCultureLike;warnings:string[]}
  | {
      status:"CROP_NOT_SUPPORTED"|"NO_MATCH"|"AMBIGUOUS"|"WATER_CONDITION_REQUIRED";
      culture:null;
      warnings:string[];
    };

export function resolveAgritecCultureExact(input:{
  cultures:AgritecCultureLike[];
  cropCode:string;
  irrigated:boolean|null|undefined;
}):AgritecCultureResolution{
  const expected=PLANNING_CROP_TO_AGRITEC_BASE[input.cropCode.trim().toUpperCase()];
  if(!expected){
    return {status:"CROP_NOT_SUPPORTED",culture:null,warnings:["AGRITEC_PLANNING_CROP_NOT_SUPPORTED"]};
  }

  const baseMatches=input.cultures.filter((culture)=>
    culture.hasZoning&&cultureBaseNames(culture).includes(expected)
  );
  if(!baseMatches.length){
    return {status:"NO_MATCH",culture:null,warnings:["AGRITEC_CULTURE_EXACT_MATCH_NOT_FOUND"]};
  }

  if(input.irrigated==null){
    const cultivations=[...new Set(baseMatches.map((culture)=>normalizedOfficialName(culture.cultivation??"")))];
    if(cultivations.length>1){
      return {
        status:"WATER_CONDITION_REQUIRED",
        culture:null,
        warnings:["AGRITEC_CULTURE_HAS_MULTIPLE_WATER_MODES"],
      };
    }
  }

  const matches=baseMatches.filter((culture)=>cultivationMatches(culture,input.irrigated));
  const ids=[...new Set(matches.map((culture)=>culture.id))];
  if(matches.length&&ids.length===1){
    return {status:"READY",culture:matches[0],warnings:[]};
  }
  return {
    status:matches.length?"AMBIGUOUS":"NO_MATCH",
    culture:null,
    warnings:[matches.length
      ?"AGRITEC_CULTURE_EXACT_MATCH_AMBIGUOUS"
      :"AGRITEC_CULTURE_WATER_MODE_NOT_FOUND"],
  };
}

function validPlanningDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error("AGRITEC_PLANNING_DATE_INVALID");
  const parsed=new Date(`${value}T12:00:00Z`);
  if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value){
    throw new Error("AGRITEC_PLANNING_DATE_INVALID");
  }
  return parsed;
}

function monthDay(month:number,day:number){
  return month*100+day;
}

function dateFallsInsideWindow(date:Date,window:AgritecZarcWindowLike){
  const current=monthDay(date.getUTCMonth()+1,date.getUTCDate());
  const start=monthDay(window.startMonth,window.startDay);
  const end=monthDay(window.endMonth,window.endDay);
  return start<=end
    ?current>=start&&current<=end
    :current>=start||current<=end;
}

export type PlanningZarcAssessment={
  status:"CONSENSUS_RISK"|"VARIABLE_BY_SOIL_OR_CYCLE"|"NOT_INDICATED"|"SEASON_MISMATCH";
  plannedDate:string;
  seasonStartYear:number|null;
  seasonEndYear:number|null;
  candidateWindowCount:number;
  matchingWindowCount:number;
  riskLevelsPct:number[];
  sourcePortarias:string[];
  cycleLabels:string[];
  soilLabels:string[];
  unresolvedDimensions:Array<"CYCLE"|"SOIL">;
  warning:"ZARC_RISK_IS_NOT_YIELD_FORECAST";
};

export function assessAgritecPlanningDate(input:{
  windows:AgritecZarcWindowLike[];
  plannedDate:string;
  municipalityName:string;
  stateCode:string;
  expectedCropBaseName:string;
}):PlanningZarcAssessment{
  const date=validPlanningDate(input.plannedDate);
  const municipality=normalizedOfficialName(input.municipalityName);
  const state=input.stateCode.trim().toUpperCase();
  const crop=normalizedOfficialName(input.expectedCropBaseName);
  const consistent=input.windows.filter((window)=>
    normalizedOfficialName(window.municipalityName)===municipality
    &&window.stateCode===state
    &&normalizedOfficialName(window.cropName)===crop
  );

  const year=date.getUTCFullYear();
  const seasonal=consistent.filter((window)=>
    year===window.seasonStartYear||year===window.seasonEndYear
  );
  if(!seasonal.length){
    return {
      status:"SEASON_MISMATCH",
      plannedDate:input.plannedDate,
      seasonStartYear:null,
      seasonEndYear:null,
      candidateWindowCount:consistent.length,
      matchingWindowCount:0,
      riskLevelsPct:[],
      sourcePortarias:[],
      cycleLabels:[],
      soilLabels:[],
      unresolvedDimensions:[],
      warning:"ZARC_RISK_IS_NOT_YIELD_FORECAST",
    };
  }

  const seasonPairs=[...new Set(seasonal.map((window)=>`${window.seasonStartYear}/${window.seasonEndYear}`))];
  if(seasonPairs.length!==1){
    return {
      status:"SEASON_MISMATCH",
      plannedDate:input.plannedDate,
      seasonStartYear:null,
      seasonEndYear:null,
      candidateWindowCount:seasonal.length,
      matchingWindowCount:0,
      riskLevelsPct:[],
      sourcePortarias:[],
      cycleLabels:[],
      soilLabels:[],
      unresolvedDimensions:[],
      warning:"ZARC_RISK_IS_NOT_YIELD_FORECAST",
    };
  }

  const matching=seasonal.filter((window)=>dateFallsInsideWindow(date,window));
  const riskLevelsPct=[...new Set(matching.map((window)=>window.riskPct))].sort((a,b)=>a-b);
  const cycleLabels=[...new Set(seasonal.map((window)=>window.cycleLabel))].sort();
  const soilLabels=[...new Set(seasonal.map((window)=>window.soilLabel))].sort();
  const sourcePortarias=[...new Set(seasonal.map((window)=>window.ordinance))].sort();
  const [seasonStartYear,seasonEndYear]=seasonPairs[0].split("/").map(Number);

  return {
    status:matching.length===0
      ?"NOT_INDICATED"
      :riskLevelsPct.length===1
        ?"CONSENSUS_RISK"
        :"VARIABLE_BY_SOIL_OR_CYCLE",
    plannedDate:input.plannedDate,
    seasonStartYear,
    seasonEndYear,
    candidateWindowCount:seasonal.length,
    matchingWindowCount:matching.length,
    riskLevelsPct,
    sourcePortarias,
    cycleLabels,
    soilLabels,
    unresolvedDimensions:[
      ...(cycleLabels.length>1?["CYCLE" as const]:[]),
      ...(soilLabels.length>1?["SOIL" as const]:[]),
    ],
    warning:"ZARC_RISK_IS_NOT_YIELD_FORECAST",
  };
}

export function agritecCropBaseName(cropCode:string){
  return PLANNING_CROP_TO_AGRITEC_BASE[cropCode.trim().toUpperCase()]??null;
}
