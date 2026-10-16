import test from 'node:test';
import assert from 'node:assert/strict';
import {planLegacyImport,deterministicWagerId,isValidLegacyWager} from '../lib/legacy-import.mjs';
const base={id:'old-local-id',date:'2026-10-12',event:'BUF @ LAR',selections:'Kyren 25+ + Puka 80+',market:'Same-game parlay',sportsbook:'DraftKings',odds:188,stake:10,result:'win',returnOverride:30};
test('distinct legacy wagers get distinct stable owner-scoped UUIDs',async()=>{
 const a=await deterministicWagerId('user-one',base);
 const b=await deterministicWagerId('user-one',{...base,selections:'Different wager'});
 assert.match(a,/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
 assert.notEqual(a,b);assert.equal(a,await deterministicWagerId('user-one',base));assert.notEqual(a,await deterministicWagerId('user-two',base));
});
test('re-import skips existing historical wager despite old hardcoded UUID',async()=>{
 const plan=await planLegacyImport('owner',[base],[{...base,id:'65c1899d-6c6b-45eb-bc5c-a03f4dd02126'}]);
 assert.equal(plan.accepted.length,0);assert.equal(plan.duplicates,1);
});
test('import accepts multiple unique wagers and deduplicates repeated data',async()=>{
 const another={...base,id:'other-id',event:'SEA @ DEN'};
 const plan=await planLegacyImport('owner',[base,another,base,{}],[]);
 assert.equal(plan.accepted.length,2);assert.notEqual(plan.accepted[0].id,plan.accepted[1].id);
 assert.equal(plan.duplicates,1);assert.equal(plan.invalid,1);
});
test('reject invalid wagers before server insert',()=>{
 assert.equal(isValidLegacyWager({...base,stake:0}),false);
 assert.equal(isValidLegacyWager({...base,odds:50}),false);
 assert.equal(isValidLegacyWager(base),true);
});
