async function loadJSON(path){ const r=await fetch(path); if(!r.ok) throw new Error('Missing '+path); return r.json(); }
function mappingKey(from,to){ return `${from}_to_${to}`; }
function resolveCodes(map, from, to){ return map[mappingKey(from,to)] || ''; }

function evalTransitions(state, rules, lookup){
  const out = { systemNew: [], flue: [] };
  const add = (bucket, keys=[]) => keys.forEach(k => { if(!out[bucket].includes(k)) out[bucket].push(k); });

  rules.boiler_transitions.forEach(r => {
    if(r.when.from===state.boiler.from && r.when.to===state.boiler.to) add('systemNew', r.add);
  });
  rules.cylinder_transitions.forEach(r => {
    if(r.when.from===state.cylinder.from && r.when.to===state.cylinder.to) add('systemNew', r.add);
  });
  rules.flue_transitions.forEach(r => {
    const fromOK = (r.when.from==='any') || (r.when.from===state.flue.from);
    if(fromOK && r.when.to===state.flue.to) add('flue', r.add);
  });
  rules.flue_overrides.forEach(o => {
    if(state.flags[o.flag] && o.when_to.includes(state.flue.to)) add('flue', o.add);
  });
  rules.context_flags.forEach(o => {
    if(state.flags[o.flag] && o.on_boiler_to.includes(state.boiler.to)) add('systemNew', o.add);
  });

  const expand = keys => keys.map(k => lookup.notes[k]).filter(Boolean);
  return { systemNew: expand(out.systemNew), flue: expand(out.flue) };
}

async function generateDepotNotes(){
  const [maps, lookup, rules] = await Promise.all([
    loadJSON('./data/mappings.json'),
    loadJSON('./data/notes_lookup.json'),
    loadJSON('./data/rules.json')
  ]);

  const state = {
    boiler:  { from: document.querySelector('#boiler-from').value, to: document.querySelector('#boiler-to').value },
    cylinder:{ from: document.querySelector('#cyl-from').value,    to: document.querySelector('#cyl-to').value },
    flue:    { from: document.querySelector('#flue-from').value,   to: document.querySelector('#flue-to').value },
    flags: {
      plume_required:      document.querySelector('#flag-plume')?.checked || false,
      plume_not_required:  document.querySelector('#flag-noplume')?.checked || false,
      shower_pump_present: document.querySelector('#flag-pump')?.checked || false
    }
  };

  // Boiler and controls (neutral, code-expanded only)
  const blrCodes = resolveCodes(maps.boiler_mappings, state.boiler.from, state.boiler.to); // e.g. "Blr a1 b1"
  const blrBits  = blrCodes ? blrCodes.split(' ').slice(1) : [];
  const blrText  = blrBits.map(k => lookup.boiler_notes?.[k]).filter(Boolean);
  document.querySelector('#boiler-notes').value =
    ['Boiler and controls'].concat(blrText).join('; ') + ';';

  // Flue (no default plume; rules add terminal clearances + plume if flagged)
  const flKey = mappingKey(state.flue.from, state.flue.to);
  let flCodes = maps.flue_mappings[flKey] || (state.flue.to==='fanned_vertical' ? maps.flue_mappings['any_to_vertical'] : '');
  const flBits = flCodes ? flCodes.split(' ').slice(1) : [];
  let flText = flBits.map(k => lookup.flue_notes?.[k]).filter(Boolean);

  const ruleAdds = evalTransitions(state, rules, lookup);
  flText = flText.concat(ruleAdds.flue);

  document.querySelector('#flue-notes').value =
    ['Flue'].concat(flText).join('; ') + ';';

  // System characteristics (new) — rules only
  document.querySelector('#system-new-notes').value =
    ['System characteristics (new)'].concat(ruleAdds.systemNew).join('; ') + ';';
}

window.addEventListener('change', generateDepotNotes);
window.addEventListener('DOMContentLoaded', generateDepotNotes);
