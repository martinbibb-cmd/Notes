/**
 * Evaluate note transitions based on component changes and contextual flags.
 *
 * @param {Object} state - Selected current and proposed options.
 * @param {Object} state.boiler - Boiler transition with `from` and `to` keys.
 * @param {Object} state.cylinder - Cylinder transition with `from` and `to` keys.
 * @param {Object} state.flue - Flue transition with `from` and `to` keys.
 * @param {Object} [state.flags] - Contextual boolean flags.
 * @param {Object} rules - Transition rules loaded from JSON.
 * @param {Object} lookup - Lookup table containing note fragments keyed by identifier.
 * @returns {{ systemNew: string[], flue: string[] }}
 */
export function evalTransitions(state, rules, lookup) {
  if (!state || typeof state !== "object") {
    return { systemNew: [], flue: [] };
  }

  const safeArray = (value) => (Array.isArray(value) ? value : []);
  const notes = { systemNew: [], flue: [] };

  const add = (bucket, keys = []) => {
    const target = notes[bucket];
    if (!Array.isArray(target)) return;
    safeArray(keys).forEach((key) => {
      if (!target.includes(key)) {
        target.push(key);
      }
    });
  };

  const boilerTransitions = safeArray(rules?.boiler_transitions);
  boilerTransitions.forEach((rule) => {
    if (rule?.when?.from === state?.boiler?.from && rule?.when?.to === state?.boiler?.to) {
      add("systemNew", rule.add);
    }
  });

  const cylinderTransitions = safeArray(rules?.cylinder_transitions);
  cylinderTransitions.forEach((rule) => {
    if (rule?.when?.from === state?.cylinder?.from && rule?.when?.to === state?.cylinder?.to) {
      add("systemNew", rule.add);
    }
  });

  const flueTransitions = safeArray(rules?.flue_transitions);
  flueTransitions.forEach((rule) => {
    const fromMatches = rule?.when?.from === "any" || rule?.when?.from === state?.flue?.from;
    if (fromMatches && rule?.when?.to === state?.flue?.to) {
      add("flue", rule.add);
    }
  });

  const flueOverrides = safeArray(rules?.flue_overrides);
  flueOverrides.forEach((override) => {
    const flagActive = Boolean(state?.flags?.[override?.flag]);
    const toMatches = safeArray(override?.when_to).includes(state?.flue?.to);
    if (flagActive && toMatches) {
      add("flue", override.add);
    }
  });

  const contextFlags = safeArray(rules?.context_flags);
  contextFlags.forEach((contextRule) => {
    const flagActive = Boolean(state?.flags?.[contextRule?.flag]);
    const toMatches = safeArray(contextRule?.on_boiler_to).includes(state?.boiler?.to);
    if (flagActive && toMatches) {
      add("systemNew", contextRule.add);
    }
  });

  const expand = (keys = []) =>
    safeArray(keys)
      .map((key) => lookup?.notes?.[key])
      .filter((value) => typeof value === "string" && value.trim().length > 0);

  return {
    systemNew: expand(notes.systemNew),
    flue: expand(notes.flue)
  };
}

export default evalTransitions;
