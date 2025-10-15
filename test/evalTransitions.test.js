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
      boiler: { from: "regular", to: "system" },
      cylinder: { from: "vented", to: "none" },
      flue: { from: "balanced", to: "plume" },
      flags: { plumeKit: true, hasPump: true }
    },
    baseRules,
    lookup
  );

  assert.deepStrictEqual(result, {
    systemNew: ["System note 1", "System note 2", "Context flag note"],
    flue: ["Flue note base", "Flue override"]
  });
});

test("ignores unknown keys and inactive flags", () => {
  const result = evalTransitions(
    {
      boiler: { from: "system", to: "combi" },
      cylinder: { from: "unvented", to: "heatstore" },
      flue: { from: "vertical", to: "vertical" },
      flags: { plumeKit: false }
    },
    baseRules,
    lookup
  );

  assert.deepStrictEqual(result, {
    systemNew: [],
    flue: []
  });
});

test("handles missing rule groups gracefully", () => {
  const result = evalTransitions(
    {
      boiler: { from: "regular", to: "system" },
      cylinder: { from: "vented", to: "none" },
      flue: { from: "balanced", to: "plume" },
      flags: { plumeKit: true }
    },
    {},
    lookup
  );

  assert.deepStrictEqual(result, {
    systemNew: [],
    flue: []
  });
});
