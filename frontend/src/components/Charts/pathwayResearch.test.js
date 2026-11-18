import { expect, test } from 'vitest';
import { pathwaySelection, pathwayGroupSummary, pathwayCsv } from './pathwayResearch';
const all=Array.from({length:10},(_,i)=>({id:`p${i}`,mean:10-i,values:[0,1,5,0]}));
test('explicit empty selection remains empty and search is independent of membership',()=>{
  expect(pathwaySelection(all,'none',null,0).selected).toEqual([]);
  const chosen=pathwaySelection(all,'p0,p1,p2,p3,p4,p5,p6',null,1);
  expect(chosen.selected).toHaveLength(7);expect(chosen.focused.id).toBe('p6');expect(chosen.pages).toBe(2);
  expect(pathwaySelection(all,'p0,p1,p1,missing','p1',0).selected.map(r=>r.id)).toEqual(['p0','p1']);
});
test('group summaries retain all zero observations and correct group denominators',()=>{
  const samples=[{id:'a',group:'AD'},{id:'b',group:'AD'},{id:'c',group:'NC'},{id:'d',group:'NC'}];
  expect(pathwayGroupSummary(all[0],samples,'AD')).toMatchObject({n:2,detected:1,median:.5,mean:.5,q1:.25,q3:.75});
});
test('CSV preserves small numeric values, zeros and protects text cells',()=>{
  const csv=pathwayCsv([['ID','raw'],['=BAD',1e-12],['p0',0]]);
  expect(csv).toContain("\"'=BAD\",1e-12");expect(csv).toContain('"p0",0');
});
