import { json } from '../../../../_lib/cloud-platform.js';
const RELEASE='5.9.11.0';
const response=()=>json({ok:false,release:RELEASE,disabled:true,stabilized:true,
  error:'Released-player inference was retired during stabilization. Madden 27 source behavior must be certified before re-enabling.'},410);
export async function onRequestGet(){return response()}
export async function onRequestPost(){return response()}
