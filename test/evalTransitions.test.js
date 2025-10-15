import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { evalTransitions } from "../src/evalTransitions.js";

const lookup = JSON.parse(readFileSync(new URL("../data/notes_lookup.json", import.meta.url), "utf8"));
const rules = JSON.parse(readFileSync(new URL("../data/rules.json", import.meta.url), "utf8"));

test("evaluates boiler, cylinder, and flue transitions with plume override", () => {
  const state = {
    boiler: { from: "regular", to: "regular" },
    cylinder: { from: "vented", to: "vented" },
    flue: { from: "balanced", to: "fanned_horizontal" },
    flags: { plume_required: true }
  };

  const result = evalTransitions(state, rules, lookup);

  assert.deepStrictEqual(result, {
    systemNew: [
      lookup.notes.keep_open_vent,
      lookup.notes.retain_vented_cyl
    ],
    flue: [
      lookup.notes.fanned_horizontal,
      lookup.notes.terminal_clearances,
      lookup.notes.plume_kit
    ]
  });
});

test("deduplicates notes and applies context flags for shower pumps", () => {
  const state = {
    boiler: { from: "system", to: "combi" },
    cylinder: { from: "unvented", to: "none" },
    flue: { from: "open", to: "fanned_horizontal" },
    flags: { shower_pump_present: true }
  };

  const result = evalTransitions(state, rules, lookup);

  assert.deepStrictEqual(result, {
    systemNew: [
      lookup.notes.dhw_now_mains,
      lookup.notes.remove_shower_pumps,
      lookup.notes.no_replacement_cyl
    ],
    flue: [
      lookup.notes.fanned_horizontal,
      lookup.notes.terminal_clearances
    ]
  });
});

test("handles missing transitions by returning empty arrays", () => {
  const state = {
    boiler: { from: "system", to: "system" },
    cylinder: { from: "none", to: "none" },
    flue: { from: "balanced", to: "balanced" },
    flags: {}
  };

  const result = evalTransitions(state, rules, lookup);

  assert.deepStrictEqual(result, {
    systemNew: [],
    flue: []
  });
});
