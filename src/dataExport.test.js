import { describe, it, expect } from "vitest";
import { logsToCSV, weighInsToCSV, buildExportJSON } from "./dataExport.js";

describe("logsToCSV", () => {
  it("writes the header row", () => {
    const csv = logsToCSV({});
    expect(csv).toBe("exercise_slug,date,weight,reps,effort,note\n");
  });

  it("sorts rows by date then slug, and preserves set order within a slug+date", () => {
    const logs = {
      "bench-press": [
        { date: "2026-07-02", weight: "95", reps: "10", effort: 0, note: null },
        { date: "2026-07-01", weight: "90", reps: "8", effort: null, note: null },
      ],
      squat: [{ date: "2026-07-01", weight: "135", reps: "5", effort: 1, note: null }],
    };
    const csv = logsToCSV(logs);
    const rows = csv.trim().split("\n");
    expect(rows).toEqual([
      "exercise_slug,date,weight,reps,effort,note",
      "bench-press,2026-07-01,90,8,,",
      "squat,2026-07-01,135,5,1,",
      "bench-press,2026-07-02,95,10,0,",
    ]);
  });

  it("preserves original insertion order for two entries with the same slug and date", () => {
    const logs = {
      "bench-press": [
        { date: "2026-07-01", weight: "90", reps: "10", effort: null, note: null },
        { date: "2026-07-01", weight: "90", reps: "8", effort: null, note: null },
      ],
    };
    const csv = logsToCSV(logs);
    const rows = csv.trim().split("\n").slice(1);
    expect(rows).toEqual(["bench-press,2026-07-01,90,10,,", "bench-press,2026-07-01,90,8,,"]);
  });

  it("renders null effort and note as empty cells", () => {
    const logs = {
      "bench-press": [{ date: "2026-07-01", weight: "90", reps: "8", effort: null, note: null }],
    };
    const csv = logsToCSV(logs);
    expect(csv).toContain("bench-press,2026-07-01,90,8,,\n");
  });

  it("quotes and escapes a note containing a comma and a double quote", () => {
    const logs = {
      "bench-press": [
        { date: "2026-07-01", weight: "90", reps: "8", effort: 0, note: 'PR, felt "great"' },
      ],
    };
    const csv = logsToCSV(logs);
    expect(csv).toContain('bench-press,2026-07-01,90,8,0,"PR, felt ""great"""\n');
  });

  it("ends with a trailing newline", () => {
    const logs = {
      "bench-press": [{ date: "2026-07-01", weight: "90", reps: "8", effort: null, note: null }],
    };
    const csv = logsToCSV(logs);
    expect(csv.endsWith("\n")).toBe(true);
    expect(csv.endsWith("\n\n")).toBe(false);
  });
});

describe("weighInsToCSV", () => {
  it("writes a header row plus data rows with a trailing newline", () => {
    const weighIns = [
      { date: "2026-07-01", weight: "180" },
      { date: "2026-07-02", weight: "179.5" },
    ];
    const csv = weighInsToCSV(weighIns);
    expect(csv).toBe("date,weight_lb\n2026-07-01,180\n2026-07-02,179.5\n");
  });

  it("writes just the header when there are no weigh-ins", () => {
    expect(weighInsToCSV([])).toBe("date,weight_lb\n");
  });
});

describe("buildExportJSON", () => {
  it("round-trips app/version/exportedAt and the raw data", () => {
    const plan = { meta: { description: "test plan" }, days: [{ id: "A", name: "Upper Day", exercises: [] }] };
    const logs = { "bench-press": [{ date: "2026-07-01", weight: "90", reps: "8", effort: 0, note: null }] };
    const weighIns = [{ date: "2026-07-01", weight: "180" }];
    const exportedAt = "2026-07-05T12:00:00.000Z";

    const json = buildExportJSON({ logs, weighIns, plan, exportedAt });
    const parsed = JSON.parse(json);

    expect(parsed.app).toBe("racked");
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBe(exportedAt);
    expect(parsed.plan).toEqual(plan);
    expect(parsed.logs).toEqual(logs);
    expect(parsed.weighIns).toEqual(weighIns);
  });
});
