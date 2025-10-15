import test from "node:test";
import assert from "node:assert/strict";

import { evalTransitions } from "../src/evalTransitions.js";

const lookup = {
  notes: {
    sn01: "System note 1",
    sn02: "System note 2",
    fl01: "Flue note base",
    fl02: "Flue override",
    cx01: "Context flag note"
  }
};

const baseRules = {
  boiler_transitions: [
    { when: { from: "regular", to: "system" }, add: ["sn01"] },
    { when: { from: "regular", to: "system" }, add: ["sn02"] }
  ],
  cylinder_transitions: [
    { when: { from: "vented", to: "none" }, add: ["sn01"] }
  ],
  flue_transitions: [
    { when: { from: "any", to: "plume" }, add: ["fl01"] },
    { when: { from: "balanced", to: "vertical" }, add: ["fl02"] }
  ],
  flue_overrides: [
    { flag: "plumeKit", when_to: ["plume"], add: ["fl02"] }
  ],
  context_flags: [
    { flag: "hasPump", on_boiler_to: ["system"], add: ["cx01"] }
  ]
};

test("collects unique notes from matching transitions", () => {
  const result = evalTransitions(
    {
      fromBoiler: "regular",
      toBoiler: "system",
      fromCylinder: "vented",
      toCylinder: "none",
      fromFlue: "balanced",
      toFlue: "plume",
      flags: { plumeKit: true, hasPump: true }
    },
    baseRules,
    lookup
  );

  assert.deepStrictEqual(result, {
    boilerNotes: [],
    flueNotes: ["Flue note base", "Flue override"],
    systemNewNotes: ["System note 1", "System note 2", "Context flag note"],
    pipeNotes: []
  });
});

test("ignores unknown keys and inactive flags", () => {
  const result = evalTransitions(
    {
      fromBoiler: "system",
      toBoiler: "combi",
      fromCylinder: "unvented",
      toCylinder: "heatstore",
      fromFlue: "vertical",
      toFlue: "vertical",
      flags: { plumeKit: false }
    },
    baseRules,
    lookup
  );

  assert.deepStrictEqual(result, {
    boilerNotes: [],
    flueNotes: [],
    systemNewNotes: [],
    pipeNotes: []
  });
});

test("handles missing rule groups gracefully", () => {
  const result = evalTransitions(
    {
      fromBoiler: "regular",
      toBoiler: "system",
      fromCylinder: "vented",
      toCylinder: "none",
      fromFlue: "balanced",
      toFlue: "plume",
      flags: { plumeKit: true }
    },
    {},
    lookup
  );

  assert.deepStrictEqual(result, {
    boilerNotes: [],
    flueNotes: [],
    systemNewNotes: [],
    pipeNotes: []
  });
});
