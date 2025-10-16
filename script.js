async function loadJSON(p){const r=await fetch(p);if(!r.ok)throw new Error('Missing '+p);return r.json();}
async function loadText(p){const r=await fetch(p);if(!r.ok)throw new Error('Missing '+p);return r.text();}

function mappingKey(f,t){return `${f}_to_${t}`;}
function resolveCodes(map,from,to){return map[mappingKey(from,to)]||'';}

function expandSectionCodes(sectionItems, codes){
  // sectionItems is an array [{code, text, ...}]
  const byCode=new Map(sectionItems.map(it=>[it.code,it.text]));
  return (codes||[]).map(c=>byCode.get(c)).filter(Boolean);
}

function evalTransitions(state, rules, lookup){
  const out={systemNew:[],flue:[]};
  const add=(bucket,keys=[])=>keys.forEach(k=>{if(!out[bucket].includes(k))out[bucket].push(k);});
  rules.boiler_transitions.forEach(r=>{if(r.when.from===state.boiler.from&&r.when.to===state.boiler.to)add('systemNew',r.add);});
  rules.cylinder_transitions.forEach(r=>{if(r.when.from===state.cylinder.from&&r.when.to===state.cylinder.to)add('systemNew',r.add);});
  rules.flue_transitions.forEach(r=>{const ok=(r.when.from==='any')||(r.when.from===state.flue.from);if(ok&&r.when.to===state.flue.to)add('flue',r.add);});
  rules.flue_overrides.forEach(o=>{if(state.flags[o.flag]&&o.when_to.includes(state.flue.to))add('flue',o.add);});
  rules.context_flags.forEach(o=>{if(state.flags[o.flag]&&o.on_boiler_to.includes(state.boiler.to))add('systemNew',o.add);});
  const expand=k=>k.map(x=>lookup.notes[x]).filter(Boolean);
  return {systemNew:expand(out.systemNew), flue:expand(out.flue)};
}

/* NEW: evaluate per-section rules using flags & transitions */
const SECTION_ALIASES={
  'System characteristics (new)': 'System characteristics',
  'Boiler and controls': 'New boiler and controls',
  'Pipework': 'Pipe work'
};

function resolveSectionKey(sectionName, dict){
  if(dict[sectionName]) return sectionName;
  const alias=SECTION_ALIASES[sectionName];
  if(alias && dict[alias]) return alias;
  return sectionName;
}

function evalSection(sectionName, rules, sectionsDict, state, transitionAdds, lookup){
  const ruleKey=((rules.sections||{})[sectionName])?sectionName:SECTION_ALIASES[sectionName]||sectionName;
  const secRules=(rules.sections||{})[ruleKey]||[];
  const chosenCodes=new Set(); const chosenTextKeys=new Set();

  const hasAllFlags=(needFlags)=> (needFlags||[]).every(f=>!!state.flags[f]);

  secRules.forEach(r=>{
    let ok=true;
    if(r.when_flags && !hasAllFlags(r.when_flags)) ok=false;
    if(r.when_to_boiler && !(r.when_to_boiler.includes(state.boiler.to))) ok=false;
    if(r.when_to_cylinder && !(r.when_to_cylinder.includes(state.cylinder.to))) ok=false;
    if(ok){
      (r.add_codes||[]).forEach(c=>chosenCodes.add(c));
      (r.add_text_keys||[]).forEach(k=>chosenTextKeys.add(k));
    }
  });

  // Merge transitionAdds where appropriate (only for System characteristics (new) & Flue)
  const mergeText=(sectionName==="System characteristics (new)"? transitionAdds.systemNew :
                   sectionName==="Flue"? transitionAdds.flue : []);

  // Expand codes via sections_source mapping:
  const items=sectionsDict[resolveSectionKey(sectionName, sectionsDict)]||[];
  const textsFromCodes=expandSectionCodes(items, Array.from(chosenCodes));
  const textsFromKeys=Array.from(chosenTextKeys).map(k=>lookup.notes[k]).filter(Boolean);
  return mergeText.concat(textsFromCodes, textsFromKeys);
}

function toDepot(title, lines){const arr=[title].concat(lines.filter(Boolean));return arr.join('; ')+';';}

async function generateAll(){
  const [maps, lookup, rules, src] = await Promise.all([
    loadJSON('./data/mappings.json'),
    loadJSON('./data/notes_lookup.json'),
    loadJSON('./data/rules.json'),
    loadText('./data/sections_source.txt')
  ]);

  // parse sections_source.txt → { SectionName: [{code, group, text}, ...] }
  const sections={}; let cur=null;
  src.split(/\r?\n/).forEach(ln=>{
    if(!ln.trim())return;
    const m=ln.match(/^\[(.+?)\]$/); if(m){cur=m[1]; sections[cur]=[]; return;}
    if(!cur) return;
    const parts=ln.split('|').map(s=>s.trim());
    if(parts.length>=2){
      const code=parts[0];
      const group=parts[1]||'';
      const text=parts.length>2?parts.slice(2).join(' | '):group;
      sections[cur].push({code, group, text});
    }
  });

  // Gather state from UI (ensure these IDs exist)
  const state={
    boiler:{from:document.querySelector('#boiler-from').value,to:document.querySelector('#boiler-to').value},
    cylinder:{from:document.querySelector('#cyl-from').value,to:document.querySelector('#cyl-to').value},
    flue:{from:document.querySelector('#flue-from').value,to:document.querySelector('#flue-to').value},
    flags:{
      plume_required:document.querySelector('#flag-plume')?.checked||false,
      plume_not_required:document.querySelector('#flag-noplume')?.checked||false,
      shower_pump_present:document.querySelector('#flag-pump')?.checked||false,
      /* site flags driving logic across sections */
      low_mains_pressure:document.querySelector('#f-low-pressure')?.checked||false,
      slow_hotwater_to_distant_outlets:document.querySelector('#f-slow-dhw')?.checked||false,
      need_space:document.querySelector('#f-need-space')?.checked||false,
      reduce_running_costs:document.querySelector('#f-low-costs')?.checked||false,
      pref_simple_controls:document.querySelector('#f-simple-controls')?.checked||false,
      noise_sensitive:document.querySelector('#f-quiet')?.checked||false,
      future_ready:document.querySelector('#f-future')?.checked||false,

      loft_install:document.querySelector('#f-loft')?.checked||false,
      loft_unboarded:document.querySelector('#f-loft-unboarded')?.checked||false,
      flat_roof_work:document.querySelector('#f-flat-roof')?.checked||false,
      two_storeys_or_45deg:document.querySelector('#f-high-reach')?.checked||false,
      scaffold_required_standard:document.querySelector('#f-scf-std')?.checked||false,
      scaffold_required_bridging:document.querySelector('#f-scf-bridge')?.checked||false,
      scaffold_required_cantilever:document.querySelector('#f-scf-cant')?.checked||false,

      microbore:document.querySelector('#f-microbore')?.checked||false,
      one_pipe:document.querySelector('#f-one-pipe')?.checked||false,
      galv_or_steel:document.querySelector('#f-galv')?.checked||false,
      external_condensate:document.querySelector('#f-cond-external')?.checked||false,
      loc_kitchen:document.querySelector('#f-loc-kitchen')?.checked||false,
      loc_kitchen_cupboard:document.querySelector('#f-loc-kitchen-cup')?.checked||false,
      loc_utility:document.querySelector('#f-loc-utility')?.checked||false,
      loc_loft:document.querySelector('#f-loc-loft')?.checked||false,
      loc_garage:document.querySelector('#f-loc-garage')?.checked||false,
      loc_airing:document.querySelector('#f-loc-airing')?.checked||false,
      ctrl_hive:document.querySelector('#f-ctrl-hive')?.checked||false,
      ctrl_hive_mini:document.querySelector('#f-ctrl-hive-mini')?.checked||false,
      ctrl_prog_stat:document.querySelector('#f-ctrl-prog-stat')?.checked||false,
      ctrl_wireless_stat:document.querySelector('#f-ctrl-wireless')?.checked||false,

      cyl_remove:document.querySelector('#f-cyl-remove')?.checked||false,
      cyl_replace:document.querySelector('#f-cyl-replace')?.checked||false,
      cws_tank_remove:document.querySelector('#f-cws-remove')?.checked||false,
      two_person_lift:document.querySelector('#f-two-person')?.checked||false,

      no_loft_access:document.querySelector('#f-no-loft')?.checked||false,
      restricted_clearance:document.querySelector('#f-tight')?.checked||false,
      permit_parking:document.querySelector('#f-permit')?.checked||false,
      restricted_hours:document.querySelector('#f-hours')?.checked||false,
      vulnerable_occupant:document.querySelector('#f-vulnerable')?.checked||false,
      septic_tank:document.querySelector('#f-septic')?.checked||false,
      listed_building:document.querySelector('#f-listed')?.checked||false,
      flat_management_permission:document.querySelector('#f-leasehold')?.checked||false,

      asbestos_suspected:document.querySelector('#f-asbestos')?.checked||false,
      fragile_roof:document.querySelector('#f-fragile-roof')?.checked||false,
      flood_risk:document.querySelector('#f-flood')?.checked||false,
      wasps:document.querySelector('#f-wasps')?.checked||false,
      bees:document.querySelector('#f-bees')?.checked||false,
      no_lighting:document.querySelector('#f-no-light')?.checked||false,
      pet_mess:document.querySelector('#f-pet-mess')?.checked||false,
      dogs_present:document.querySelector('#f-dogs')?.checked||false,
      overhead_cables:document.querySelector('#f-oh-cables')?.checked||false,

      pref_am:document.querySelector('#f-am')?.checked||false,
      pref_pm:document.querySelector('#f-pm')?.checked||false,
      large_vehicle_ok:document.querySelector('#f-lg-ok')?.checked||false,
      large_vehicle_restricted:document.querySelector('#f-lg-nok')?.checked||false,
      deliver_to_garage:document.querySelector('#f-del-garage')?.checked||false,
      deliver_inside:document.querySelector('#f-del-inside')?.checked||false,
      call_ahead:document.querySelector('#f-call')?.checked||false,

      direct_labour:document.querySelector('#f-direct-labour')?.checked||false,
      asbestos_removal_arrange:document.querySelector('#f-office-asb')?.checked||false,
      specialist_builder:document.querySelector('#f-office-builder')?.checked||false,
      scaffold_needed:document.querySelector('#f-office-scf')?.checked||false,

      use_same_hole_minor:document.querySelector('#f-flue-same-hole')?.checked||false,
      new_hole_same_wall:document.querySelector('#f-flue-new-same')?.checked||false,
      new_hole_alt_wall:document.querySelector('#f-flue-new-alt')?.checked||false,
      terminal_guard:document.querySelector('#f-terminal-guard')?.checked||false,
      boundary_close:document.querySelector('#f-boundary-close')?.checked||false,

      upgrade_gas_22mm:document.querySelector('#f-gas-22')?.checked||false,
      long_run_capacity:document.querySelector('#f-gas-long')?.checked||false,
      cond_internal_trap_add:document.querySelector('#f-cond-trap')?.checked||false,
      cond_external:document.querySelector('#f-cond-external')?.checked||false,
      cond_pump:document.querySelector('#f-cond-pump')?.checked||false,
      cond_neutraliser:document.querySelector('#f-cond-neutraliser')?.checked||false,
      increase_mains_flow:document.querySelector('#f-mains-boost')?.checked||false,
      scale_filter:document.querySelector('#f-scale-filter')?.checked||false,
      discharge_tundish_visible:document.querySelector('#f-tundish')?.checked||false,

      powerflush:document.querySelector('#f-powerflush')?.checked||false,
      chem_clean:document.querySelector('#f-chemclean')?.checked||false,
      mag_filter:document.querySelector('#f-magfilter')?.checked||false,

      replace_rads:document.querySelector('#f-rads-replace')?.checked||false,
      fit_trvs:document.querySelector('#f-trvs')?.checked||false,
      balance_on_completion:document.querySelector('#f-balance')?.checked||false,

      clear_work_areas:document.querySelector('#f-clear')?.checked||false,
      permissions_required:document.querySelector('#f-permissions')?.checked||false,
      pets_present:document.querySelector('#f-pets')?.checked||false,
      remove_cupboard_customer:document.querySelector('#f-cust-remove-cb')?.checked||false,
      rebuild_cupboard_customer:document.querySelector('#f-cust-rebuild-cb')?.checked||false,
      customer_supply_items:document.querySelector('#f-cust-supply')?.checked||false
    }
  };

  // 1) Boiler & flue code expansions (neutral)
  const blrCodes = resolveCodes(maps.boiler_mappings, state.boiler.from, state.boiler.to);
  const blrBits = blrCodes ? blrCodes.split(' ').slice(1) : [];
  const blrText = blrBits.map(k=>lookup.boiler_notes?.[k]).filter(Boolean);

  const flKey = mappingKey(state.flue.from, state.flue.to);
  let flCodes = maps.flue_mappings[flKey] || (state.flue.to==='fanned_vertical' ? maps.flue_mappings['any_to_vertical'] : '');
  const flBits = flCodes ? flCodes.split(' ').slice(1) : [];
  let flText = flBits.map(k=>lookup.flue_notes?.[k]).filter(Boolean);

  // 2) Transition-driven adds
  const transAdds = evalTransitions(state, rules, lookup);
  flText = flText.concat(transAdds.flue);

  // 3) Section logic (auto-pick essentials)
  const sec = (name)=> {
    const lines = evalSection(name, rules, sections, state, transAdds, lookup);
    // essentialise
    const max = rules.essentialiser?.max_per_section ?? 6;
    return Array.from(new Set(lines)).slice(0,max);
  };

  // 4) Write outputs
  document.querySelector('#boiler-notes').value = ['Boiler and controls'].concat(blrText).join('; ')+';';
  document.querySelector('#flue-notes').value   = toDepot('Flue', Array.from(new Set(flText)));
  document.querySelector('#system-new-notes').value = toDepot('System characteristics (new)', sec('System characteristics (new)'));
  document.querySelector('#needs-out').value    = toDepot('Needs', sec('Needs'));
  document.querySelector('#wah-out').value      = toDepot('Working at heights', sec('Working at heights'));
  document.querySelector('#ars-out').value      = toDepot('Arse cover notes', sec('Arse_cover_notes'));
  document.querySelector('#assist-out').value   = toDepot('Components that require assistance', sec('Components that require assistance'));
  document.querySelector('#restrictions-out').value = toDepot('Restrictions to work', sec('Restrictions to work'));
  document.querySelector('#hazards-out').value  = toDepot('External hazards', sec('External hazards'));
  document.querySelector('#delivery-out').value = toDepot('Delivery notes', sec('Delivery notes'));
  document.querySelector('#office-out').value   = toDepot('Office notes', sec('Office notes'));
  document.querySelector('#bc-out').value       = toDepot('Boiler and controls', sec('Boiler and controls'));
  document.querySelector('#flue-extra-out').value = toDepot('Flue', sec('Flue'));
  document.querySelector('#pipe-out').value     = toDepot('Pipework', sec('Pipework'));
  document.querySelector('#disruption-out').value = toDepot('Disruption / Cleaning / Filtration', sec('Disruption / Cleaning / Filtration'));
  document.querySelector('#rads-out').value     = toDepot('Radiators', sec('Radiators'));
  document.querySelector('#customer-out').value = toDepot('Customer actions', sec('Customer actions'));
}

window.addEventListener('DOMContentLoaded', ()=> {
  // compute whenever inputs change
  document.body.addEventListener('change', generateAll);
  generateAll();
});
