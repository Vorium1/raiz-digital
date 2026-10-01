import assert from 'node:assert/strict';
import { selectTimelineEvents, timelineCalendarDay } from '../src/domain/field-timeline-filters.ts';
const event = (id, date, category='LAB', seasonId='season-a') => ({
  id, occurredAt:date, category, seasonId, analysisId:'analysis-e2e', title:'E2E event', detail:'E2E',
  dateBasis:'EVENT', source:{entityType:'analysis',id:'analysis-e2e',href:'/analises/analysis-e2e'},
  responsibleName:null,rule:null,evidenceRefs:[],limitations:[],
});
const input=[event('b','2026-09-30T12:00:00Z'),event('a','2026-09-30T12:00:00Z'),event('older','2026-09-29'),event('other-season','2026-09-30','DECISION','season-b'),event('field-history','2026-09-30','FOLLOWUP',null),event('invalid','invalid'),event('a','2026-09-30T12:00:00Z')];
assert.deepEqual(selectTimelineEvents(input).map(e=>e.id),['a','b','field-history','other-season','older']);
assert.equal(input.length,7);
assert.deepEqual(selectTimelineEvents(input,{seasonId:'season-a',fromDate:'2026-09-30',toDate:'2026-09-30'}).map(e=>e.id),['a','b','field-history']);
assert.deepEqual(selectTimelineEvents(input,{category:'DECISION'}).map(e=>e.id),['other-season']);
assert.deepEqual(selectTimelineEvents(input,{category:'RULE'}),[]);
assert.throws(()=>selectTimelineEvents(input,{fromDate:'2026-02-31'}),/datas válidas/);
assert.throws(()=>selectTimelineEvents(input,{fromDate:'2026-10-01',toDate:'2026-09-30'}),/inicial/);
assert.equal(timelineCalendarDay('2026-09-30T01:00:00Z','America/Sao_Paulo'),'2026-09-29');
assert.equal(timelineCalendarDay('2026-09-30','America/Sao_Paulo'),'2026-09-30');
assert.equal(timelineCalendarDay('2026-02-31'),null);
assert.deepEqual(selectTimelineEvents([event('boundary','2026-09-30T01:00:00Z')],{fromDate:'2026-09-29',toDate:'2026-09-29',timeZone:'America/Sao_Paulo'}).map(e=>e.id),['boundary']);
assert.equal(selectTimelineEvents([]).length,0);
console.log('field-timeline-filters: stable order, deduplication, inclusive calendar dates, real season links, undated events and time zones approved.');
