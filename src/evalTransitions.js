/**
 * Evaluate note transitions based on component changes and contextual flags.
 *
 * @param {Object} selections
 * @param {string} selections.fromBoiler - Current boiler type key.
 * @param {string} selections.toBoiler - Proposed boiler type key.
 * @param {string} selections.fromCylinder - Current cylinder type key.
 * @param {string} selections.toCylinder - Proposed cylinder type key.
 * @param {string} selections.fromFlue - Current flue type key.
 * @param {string} selections.toFlue - Proposed flue type key.
 * @param {Record<string, boolean>} selections.flags - Active context flags.
 * @param {Object} rules - Transition rule sets.
 * @param {Array} [rules.boiler_transitions]
 * @param {Array} [rules.cylinder_transitions]
 * @param {Array} [rules.flue_transitions]
 * @param {Array} [rules.flue_overrides]
 * @param {Array} [rules.context_flags]
 * @param {Object} lookup - Lookup table containing note fragments.
 * @param {Record<string, string>} lookup.notes - Map of note keys to sentences.
 * @returns {{boilerNotes: string[], flueNotes: string[], systemNewNotes: string[], pipeNotes: string[]}}
 */
export function evalTransitions(
  { fromBoiler, toBoiler, fromCylinder, toCylinder, fromFlue, toFlue, flags },
  rules,
  lookup
) {
  const notes = { boiler: [], flue: [], systemNew: [], pipe: [] };

  const add = (bucket, keys = []) => {
    if (!Array.isArray(notes[bucket]) || !Array.isArray(keys)) return;
    keys.forEach((key) => {
      if (!notes[bucket].includes(key)) {
        notes[bucket].push(key);
      }
    });
  };

  const boilerTransitions = Array.isArray(rules?.boiler_transitions) ? rules.boiler_transitions : [];
  boilerTransitions.forEach((rule) => {
    if (rule?.when?.from === fromBoiler && rule?.when?.to === toBoiler) {
      add("systemNew", rule.add);
    }
  });

  const cylinderTransitions = Array.isArray(rules?.cylinder_transitions) ? rules.cylinder_transitions : [];
  cylinderTransitions.forEach((rule) => {
    if (rule?.when?.from === fromCylinder && rule?.when?.to === toCylinder) {
      add("systemNew", rule.add);
    }
  });

  const flueTransitions = Array.isArray(rules?.flue_transitions) ? rules.flue_transitions : [];
  flueTransitions.forEach((rule) => {
    const fromMatches = rule?.when?.from === "any" || rule?.when?.from === fromFlue;
    if (fromMatches && rule?.when?.to === toFlue) {
      add("flue", rule.add);
    }
  });

  const flueOverrides = Array.isArray(rules?.flue_overrides) ? rules.flue_overrides : [];
  flueOverrides.forEach((override) => {
    const flagActive = Boolean(flags?.[override?.flag]);
    const matchesTo = Array.isArray(override?.when_to) && override.when_to.includes(toFlue);
    if (flagActive && matchesTo) {
      add("flue", override.add);
    }
  });

  const contextFlags = Array.isArray(rules?.context_flags) ? rules.context_flags : [];
  contextFlags.forEach((contextRule) => {
    const flagActive = Boolean(flags?.[contextRule?.flag]);
    const matchesBoilerTo = Array.isArray(contextRule?.on_boiler_to)
      ? contextRule.on_boiler_to.includes(toBoiler)
      : false;
    if (flagActive && matchesBoilerTo) {
      add("systemNew", contextRule.add);
    }
  });

  const expand = (keys = []) =>
    keys
      .map((key) => lookup?.notes?.[key])
      .filter((value) => typeof value === "string" && value.trim().length > 0);

  return {
    boilerNotes: expand(notes.boiler),
    flueNotes: expand(notes.flue),
    systemNewNotes: expand(notes.systemNew),
    pipeNotes: expand(notes.pipe)
  };
}

export default evalTransitions;
