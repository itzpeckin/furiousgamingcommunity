import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleQuad,rankGlyph,matchDecision,simulateRules,detectStaffRow,SIZE} from '../../assets/loadout-vision.js';

test('unreadable and unrelated blank images never produce an ability or staff row',()=>{
 const image={width:120,height:120,data:new Uint8ClampedArray(120*120*4).fill(127)};
 assert.equal(detectStaffRow(image),null);
 const tile=sampleQuad(image,[[10,10],[110,10],[110,110],[10,110]]);
 assert.deepEqual(rankGlyph(tile,[{id:'unrelated',gray:new Float32Array(SIZE*SIZE)}]),[]);
 assert.equal(matchDecision([]).status,'uncertain');
});
test('crossed, collapsed, missing and out-of-image crop corners are rejected',()=>{
 const image={width:120,height:120,data:new Uint8ClampedArray(120*120*4)};
 for(const quad of [null,[[0,0]],[[0,0],[110,110],[110,0],[0,110]],[[10,10],[10,10],[10,10],[10,10]],[[0,0],[121,0],[121,110],[0,110]],[[0,0],[NaN,0],[110,110],[0,110]]])assert.throws(()=>sampleQuad(image,quad));
});
test('shared glyphs and close position lettering cannot produce a confident identity',()=>{
 for(const id of ['trimmed-edges','all-hustle'])assert.equal(matchDecision([{id,score:1},{id:'other',score:.1}]).status,'uncertain');
 assert.equal(matchDecision([{id:'practician-cb',score:.859},{id:'practician-qb',score:.771}]).status,'uncertain');
 assert.equal(matchDecision([{id:'practician-ol',score:.619},{id:'practician-dl',score:.507}]).status,'uncertain');
 assert.equal(matchDecision([{id:'after-school-tutor',score:.881},{id:'mr-dream',score:.510}]).status,'matched');
});
test('rule simulation retains missing and uncertain evidence, even with duplicate bans',()=>{
 const equipped=id=>({state:'equipped',decision:{status:'matched',ids:[id]}});
 const locked={state:'locked',decision:{status:'uncertain',ids:[]}};
 assert.equal(simulateRules([equipped('a'),...Array(5).fill(locked)]).status,'no-violation-detected');
 assert.equal(simulateRules([equipped('a')]).status,'incomplete');
 assert.equal(simulateRules([equipped('a'),{state:'unknown',decision:{status:'matched',ids:['b']}},...Array(4).fill(locked)]).status,'incomplete');
 assert.equal(simulateRules([{state:'equipped',decision:{status:'uncertain',ids:['a','b']}},...Array(5).fill(locked)],{banned:['a','b']}).status,'incomplete');
 const result=simulateRules([equipped('a'),equipped('a'),...Array(4).fill(locked)],{banned:['a'],banDuplicates:true});
 assert.equal(result.status,'possible-violation');assert.equal(result.violations.filter(v=>v.type==='duplicate').length,1);
 assert.equal(simulateRules([equipped('a'),equipped('a'),...Array(4).fill(locked)]).status,'no-violation-detected');
});
