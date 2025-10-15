/**
 * Evaluate transition rules for the currently selected system state.
 *
 * @param {Object} state - User selections describing system changes.
 * @param {Object} state.boiler
 * @param {string} state.boiler.from
 * @param {string} state.boiler.to
 * @param {Object} state.cylinder
 * @param {string} state.cylinder.from
 * @param {string} state.cylinder.to
 * @param {Object} state.flue
 * @param {string} state.flue.from
 * @param {string} state.flue.to
 * @param {Record<string, boolean>} state.flags
 * @param {Object} rules
 * @param {Array} [rules.boiler_transitions]
 * @param {Array} [rules.cylinder_transitions]
 * @param {Array} [rules.flue_transitions]
 * @param {Array} [rules.flue_overrides]
 * @param {Array} [rules.context_flags]
 * @param {Object} lookup
 * @param {Record<string, string>} lookup.notes
 * @returns {{systemNew: string[], flue: string[]}}
 */
export function evalTransitions(state = {}, rules = {}, lookup = {}) {
  const notes = { systemNew: [], flue: [] };

  const add = (bucket, keys = []) => {
    if (!Array.isArray(notes[bucket]) || !Array.isArray(keys)) return;
    keys.forEach((key) => {
      if (!notes[bucket].includes(key)) {
        notes[bucket].push(key);
      }
    });
  };

  const boilerState = state.boiler ?? {};
  const cylinderState = state.cylinder ?? {};
  const flueState = state.flue ?? {};
  const flags = state.flags ?? {};

  const boilerTransitions = Array.isArray(rules.boiler_transitions)
    ? rules.boiler_transitions
    : [];
  boilerTransitions.forEach((rule) => {
    if (rule?.when?.from === boilerState.from && rule?.when?.to === boilerState.to) {
      add("systemNew", rule.add);
    }
  });

  const cylinderTransitions = Array.isArray(rules.cylinder_transitions)
    ? rules.cylinder_transitions
    : [];
  cylinderTransitions.forEach((rule) => {
    if (rule?.when?.from === cylinderState.from && rule?.when?.to === cylinderState.to) {
      add("systemNew", rule.add);
    }
  });

  const flueTransitions = Array.isArray(rules.flue_transitions) ? rules.flue_transitions : [];
  flueTransitions.forEach((rule) => {
    const fromMatches = rule?.when?.from === "any" || rule?.when?.from === flueState.from;
    if (fromMatches && rule?.when?.to === flueState.to) {
      add("flue", rule.add);
    }
  });

  const flueOverrides = Array.isArray(rules.flue_overrides) ? rules.flue_overrides : [];
  flueOverrides.forEach((override) => {
    const flagActive = Boolean(flags?.[override?.flag]);
    const matchesTo = Array.isArray(override?.when_to) && override.when_to.includes(flueState.to);
    if (flagActive && matchesTo) {
      add("flue", override.add);
    }
  });

  const contextFlags = Array.isArray(rules.context_flags) ? rules.context_flags : [];
  contextFlags.forEach((contextRule) => {
    const flagActive = Boolean(flags?.[contextRule?.flag]);
    const matchesBoilerTo = Array.isArray(contextRule?.on_boiler_to)
      ? contextRule.on_boiler_to.includes(boilerState.to)
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
    systemNew: expand(notes.systemNew),
    flue: expand(notes.flue)
  };
}

export default evalTransitions;
