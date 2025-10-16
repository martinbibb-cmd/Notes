// --- helpers ---
async function loadText(path){ const r=await fetch(path); if(!r.ok) throw new Error('Missing '+path); return r.text(); }
async function loadJSON(path){ const r=await fetch(path); if(!r.ok) throw new Error('Missing '+path); return r.json(); }
function copyText(selector){
  const el=document.querySelector(selector);
  if(!el) return;
  const { selectionStart, selectionEnd, readOnly } = el;
  try {
    if(readOnly) el.readOnly = false;
    el.focus();
    el.select();
    document.execCommand('copy');
  } finally {
    if(readOnly) el.readOnly = true;
    if(typeof selectionStart === 'number' && typeof selectionEnd === 'number'){
      el.setSelectionRange(selectionStart, selectionEnd);
    }
    el.blur();
  }
}

function mappingKey(from,to){ return `${from}_to_${to}`; }
function resolveCodes(map, from, to){ return map[mappingKey(from,to)] || ''; }

function resolveFlueCodes(map, from, to){
  if(to==='fanned_vertical') return map['any_to_vertical'] || '';
  if(to==='fanned_horizontal'){
    if(from==='horizontal') return map['horizontal_to_same'] || '';
    if(from==='balanced') return map['balanced_to_fanned'] || '';
    if(from==='open') return map['open_to_fanned'] || '';
    if(from==='any') return map['balanced_to_fanned'] || '';
  }
  return '';
}

// parse sections_source.txt → structured sections
function parseSections(src){
  const lines=src.split(/\r?\n/);
  const sections={}; let current=null;
  for(const ln of lines){
    if(!ln.trim()) continue;
    const m = ln.match(/^\[(.+?)\]$/);
    if(m){ current=m[1]; sections[current]=[]; continue; }
    if(!current) continue;
    const parts = ln.split('|').map(s=>s.trim());
    if(parts.length>=2){
      const code = parts[0];
      const group = parts.length>2 ? parts[1] : '';
      let text = parts.length>2 ? parts.slice(2).join(' | ') : parts[1];
      if(!text) text = group || '';
      sections[current].push({code, group, text});
    }
  }
  return sections;
}

// build checklist UI for a section (narrowed view)
function buildChecklist(containerId, title, items){
  const c=document.querySelector(containerId);
  if(!c) return;
  c.innerHTML=`<h3>${title}</h3>`;
  const list=document.createElement('div'); list.className='list';
  items.forEach((it,i)=>{
    const row=document.createElement('label');
    row.style.display='block'; row.style.margin='4px 0';
    row.innerHTML=`<input type="checkbox" data-code="${it.code}" data-text="${it.text}"> ${it.code} — ${it.text}`;
    list.appendChild(row);
  });
  c.appendChild(list);
  const taId = `${containerId.replace('#','')}-out`;
  c.insertAdjacentHTML('beforeend', `
    <textarea id="${taId}" rows="3" style="width:100%;margin-top:8px;" readonly></textarea>
    <button type="button" class="copy-btn" data-target="#${taId}">Copy</button>
  `);
  const btn=c.querySelector('.copy-btn');
  btn.addEventListener('click', e=>{
    const tgt=e.currentTarget.getAttribute('data-target');
    copyText(tgt);
  });
}

// essentialise selected items (limit & prioritise)
function essentialise(sectionName, selected, rules){
  const max = rules.essentialiser?.max_per_section ?? 6;
  const priList = rules.essentialiser?.priority?.[sectionName] || [];
  const pri = selected.filter(s => priList.includes(s.key));
  const rest = selected.filter(s => !priList.includes(s.key));
  return pri.concat(rest).slice(0, max);
}

// compose semicolon string
function toDepot(sectionTitle, lines){
  const parts=[sectionTitle].concat(lines.filter(Boolean));
  return parts.join('; ') + ';';
}

function generateSection(containerId, sectionTitle){
  const container=document.querySelector(containerId);
  if(!container) return;
  const checks=[...container.querySelectorAll('input[type=checkbox]:checked')];
  const lines = checks.map(ch => ch.dataset.text).filter(Boolean);
  const outId = `${containerId.replace('#','')}-out`;
  const ta=document.querySelector(`#${outId}`);
  if(!ta) return;
  ta.value = lines.length ? toDepot(sectionTitle, lines) : '';
}

function attachCopyButton(selector){
  const el=document.querySelector(selector);
  if(!el) return;
  if(el.dataset.copyAttached) return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.className='copy-btn';
  btn.textContent='Copy';
  btn.addEventListener('click', ()=>copyText(selector));
  el.insertAdjacentElement('afterend', btn);
  el.dataset.copyAttached='true';
}

function evalTransitions(state, rules){
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

  return out;
}

let __MAPPINGS__=null;
let __LOOKUP__=null;
let __RULES__=null;

function generateDepotNotes(){
  if(!__MAPPINGS__ || !__LOOKUP__ || !__RULES__) return;
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

  const blrCodes = resolveCodes(__MAPPINGS__.boiler_mappings, state.boiler.from, state.boiler.to);
  const blrBits  = blrCodes ? blrCodes.split(' ').slice(1) : [];
  const blrText  = blrBits.map(k => __LOOKUP__.boiler_notes?.[k]).filter(Boolean);
  document.querySelector('#boiler-notes').value = toDepot('Boiler and controls', blrText);

  const flCodes = resolveFlueCodes(__MAPPINGS__.flue_mappings, state.flue.from, state.flue.to);
  const flBits = flCodes ? flCodes.split(' ').slice(1) : [];
  const flMapText = flBits.map(k => __LOOKUP__.flue_notes?.[k]).filter(Boolean);

  const ruleAdds = evalTransitions(state, __RULES__);
  const flRuleObjs = ruleAdds.flue.map(k => ({ key: k, text: __LOOKUP__.notes?.[k] })).filter(o => o.text);
  const flLimited = essentialise('Flue', flRuleObjs, __RULES__).map(o => o.text);
  const flText = flMapText.concat(flLimited);
  document.querySelector('#flue-notes').value = toDepot('Flue', flText);

  const sysRuleObjs = ruleAdds.systemNew.map(k => ({ key: k, text: __LOOKUP__.notes?.[k] })).filter(o => o.text);
  const sysLimited = essentialise('System characteristics (new)', sysRuleObjs, __RULES__).map(o => o.text);
  document.querySelector('#system-new-notes').value = toDepot('System characteristics (new)', sysLimited);
}

async function initAll(){
  const [maps, notes, rules, src] = await Promise.all([
    loadJSON('./data/mappings.json'),
    loadJSON('./data/notes_lookup.json'),
    loadJSON('./data/rules.json'),
    loadText('./data/sections_source.txt')
  ]);
  __MAPPINGS__=maps; __LOOKUP__=notes; __RULES__=rules;

  const sections = parseSections(src);

  buildChecklist('#needs', 'Needs', sections['Needs'] || []);
  buildChecklist('#wah', 'Working at heights', sections['Working at heights'] || []);
  buildChecklist('#sc-old', 'System characteristics (existing/new/misc)', sections['System characteristics'] || []);
  buildChecklist('#ars', 'Arse cover notes', sections['Arse_cover_notes'] || []);
  buildChecklist('#assist', 'Components that require assistance', sections['Components that require assistance'] || []);
  buildChecklist('#restrictions', 'Restrictions to work', sections['Restrictions to work'] || []);
  buildChecklist('#hazards', 'External hazards', sections['External hazards'] || []);
  buildChecklist('#delivery', 'Delivery notes', sections['Delivery notes'] || []);
  buildChecklist('#office', 'Office notes', sections['Office notes'] || []);
  buildChecklist('#boiler-controls', 'New boiler & controls', sections['New boiler and controls'] || []);
  buildChecklist('#flue-extra', 'Flue (make good / new / rules)', sections['Flue'] || []);
  buildChecklist('#pipe', 'Pipework', sections['Pipe work'] || []);
  buildChecklist('#disruption', 'Disruption / Cleaning / Filtration', sections['Disruption / Cleaning / Filtration'] || []);
  buildChecklist('#rads', 'Radiators', sections['Radiators'] || []);
  buildChecklist('#customer', 'Customer actions', sections['Customer actions'] || []);

  attachCopyButton('#boiler-notes');
  attachCopyButton('#flue-notes');
  attachCopyButton('#system-new-notes');

  if(!document.querySelector('#copy-all')){
    const btn=document.createElement('button'); btn.id='copy-all'; btn.textContent='Copy All Notes';
    btn.className='copy-btn';
    btn.onclick = ()=>{
      const taIds=[...document.querySelectorAll('textarea[id$="-out"], #boiler-notes, #flue-notes, #system-new-notes')];
      const merged = taIds.map(el=>el.value).filter(Boolean).join(' ');
      if(!merged) return;
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(merged);
      } else {
        const tmp=document.createElement('textarea');
        tmp.style.position='fixed';
        tmp.style.opacity='0';
        tmp.value=merged;
        document.body.appendChild(tmp);
        tmp.focus();
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
      }
    };
    document.body.appendChild(btn);
  }

  const sectionMap = [
    ['#needs','Needs'],
    ['#wah','Working at heights'],
    ['#sc-old','System characteristics'],
    ['#ars','Arse cover notes'],
    ['#assist','Components that require assistance'],
    ['#restrictions','Restrictions to work'],
    ['#hazards','External hazards'],
    ['#delivery','Delivery notes'],
    ['#office','Office notes'],
    ['#boiler-controls','Boiler and controls'],
    ['#flue-extra','Flue'],
    ['#pipe','Pipework'],
    ['#disruption','Disruption'],
    ['#rads','Radiators'],
    ['#customer','Customer actions']
  ];

  document.body.addEventListener('change', ()=>{
    generateDepotNotes();
    sectionMap.forEach(([id,title])=>generateSection(id,title));
  });

  generateDepotNotes();
}

window.addEventListener('DOMContentLoaded', initAll);
