import { describe, it, expect } from "vitest";
import { EQUIP_TAGS, TRAVEL_PROFILES, guessEquipment, exEquipment, profileSwaps } from "./equipment.js";
import { SEED_DAYS, slug } from "./planUtils.js";

describe("guessEquipment", () => {
  it("trusts a Bodyweight start over any name pattern", () => {
    expect(guessEquipment({ name: "Inverted Row", start: "Bodyweight" })).toBe("bodyweight");
    expect(guessEquipment({ name: "Bodyweight Squat", start: "Bodyweight" })).toBe("bodyweight");
  });

  it("matches dumbbell before barbell so DB compound lifts don't read as barbell", () => {
    expect(guessEquipment({ name: "Dumbbell Romanian Deadlift", start: "30–40 lb DBs" })).toBe("dumbbell");
    expect(guessEquipment({ name: "Goblet Squat", start: "30–35 lb DB" })).toBe("dumbbell");
  });

  it("matches cable pulldowns/pushdowns before the machine bucket", () => {
    expect(guessEquipment({ name: "Lat Pulldown", start: "70–90 lb" })).toBe("cable");
    expect(guessEquipment({ name: "Cable Tricep Pushdown", start: "30–40 lb" })).toBe("cable");
  });

  it("recognizes machines and barbell lifts", () => {
    expect(guessEquipment({ name: "Smith Machine Squat", start: "95–115 lb" })).toBe("machine");
    expect(guessEquipment({ name: "Leg Press", start: "180–230 lb" })).toBe("machine");
    expect(guessEquipment({ name: "Trap Bar Deadlift", start: "135–155 lb" })).toBe("barbell");
  });

  it("returns null when nothing matches — an unknown never fits a profile", () => {
    expect(guessEquipment({ name: "Face Pull Variation X", start: "20 lb" })).toBe(null);
  });
});

describe("exEquipment", () => {
  it("prefers an explicit valid tag over the guess", () => {
    // Hanging work logs as bodyweight but needs gym apparatus — the seed's
    // explicit machine tag must beat the start-field guess.
    expect(exEquipment({ name: "Hanging Knee Raise / Cable Crunch", start: "Bodyweight", equip: "machine" })).toBe("machine");
  });

  it("falls back to the guess for missing or invalid tags (pre-Phase-13 plan rows)", () => {
    expect(exEquipment({ name: "Dumbbell Curl", start: "15–20 lb DBs" })).toBe("dumbbell");
    expect(exEquipment({ name: "Dumbbell Curl", start: "15–20 lb DBs", equip: "kettlebell" })).toBe("dumbbell");
  });
});

describe("profileSwaps", () => {
  it("keeps fitting primaries and swaps the rest to their first fitting alt", () => {
    const { swaps } = profileSwaps(SEED_DAYS, "dumbbells");
    // Dumbbell primary: untouched.
    expect(swaps["goblet-squat"]).toBeUndefined();
    // Cable primary → the dumbbell alt, not the machine one.
    expect(swaps["seated-cable-row"]).toBe("Chest-Supported Dumbbell Row");
    expect(swaps["cable-tricep-pushdown"]).toBe("Overhead Dumbbell Tricep Extension");
  });

  it("covers every seed exercise under the dumbbells profile", () => {
    const { unmatched } = profileSwaps(SEED_DAYS, "dumbbells");
    expect(unmatched).toEqual([]);
  });

  it("hotel gym only displaces the barbell work", () => {
    const { swaps, unmatched } = profileSwaps(SEED_DAYS, "hotel");
    expect(unmatched).toEqual([]);
    // Barbell alts are skipped in favor of the dumbbell variant.
    expect(swaps["barbell-dumbbell-deadlift"]).toBe("Dumbbell Deadlift");
    // Everything else in the seed already fits a hotel gym.
    expect(Object.keys(swaps)).toEqual(["barbell-dumbbell-deadlift"]);
  });

  it("bodyweight profile swaps to bodyweight-tagged alts and reports the two lifts with no honest bodyweight variant", () => {
    const { swaps, unmatched } = profileSwaps(SEED_DAYS, "bodyweight");
    expect(swaps["goblet-squat"]).toBe("Bodyweight Squat");
    expect(swaps["incline-dumbbell-press"]).toBe("Push-Up");
    expect(swaps["hanging-knee-raise-cable-crunch"]).toBe("Lying Leg Raise");
    // No bodyweight curl or lateral raise exists — these stay unswapped and
    // keep the manual picker (the doc's explicit fallback).
    expect(unmatched.sort()).toEqual(["cable-bicep-curl", "lateral-raises"]);
    // Every swap target really is bodyweight-tagged.
    const altByName = new Map();
    for (const d of SEED_DAYS) for (const ex of d.exercises) for (const a of ex.alts || []) altByName.set(a.name, a);
    for (const name of Object.values(swaps)) expect(exEquipment(altByName.get(name))).toBe("bodyweight");
  });

  it("works on an untagged plan via the name guess (pre-Phase-13 AI plan rows)", () => {
    const stripped = JSON.parse(JSON.stringify(SEED_DAYS, (key, value) => (key === "equip" ? undefined : value)));
    const { swaps } = profileSwaps(stripped, "dumbbells");
    expect(swaps["seated-cable-row"]).toBe("Chest-Supported Dumbbell Row");
    expect(swaps["goblet-squat"]).toBeUndefined();
  });

  it("returns an empty result for an unknown profile id", () => {
    expect(profileSwaps(SEED_DAYS, "space-station")).toEqual({ swaps: {}, unmatched: [] });
  });

  it("keeps seed exercise slugs stable as swap keys", () => {
    // The swap map is keyed by primary slug — the same key RackedTracker uses.
    for (const key of Object.keys(profileSwaps(SEED_DAYS, "bodyweight").swaps)) {
      const found = SEED_DAYS.some((d) => d.exercises.some((ex) => slug(ex.name) === key));
      expect(found).toBe(true);
    }
  });

  it("every seed tag is from the fixed vocabulary", () => {
    for (const d of SEED_DAYS) {
      for (const ex of d.exercises) {
        expect(EQUIP_TAGS).toContain(ex.equip);
        for (const a of ex.alts || []) expect(EQUIP_TAGS).toContain(a.equip);
      }
    }
  });

  it("profiles are the three fixed ones from the design doc", () => {
    expect(TRAVEL_PROFILES.map((p) => p.id)).toEqual(["bodyweight", "dumbbells", "hotel"]);
  });
});
