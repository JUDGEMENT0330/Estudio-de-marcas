import { describe, expect, it } from "vitest";

import { reportListActionLabel } from "@/lib/reports/report-list-display";

describe("report list display", () => {
  it("does not label failed reports as processing", () => {
    expect(reportListActionLabel("failed")).toBe("Fallida");
  });

  it("labels active report jobs as processing", () => {
    expect(reportListActionLabel("queued")).toBe("Procesando…");
    expect(reportListActionLabel("processing")).toBe("Procesando…");
  });

  it("labels completed reports with the view action", () => {
    expect(reportListActionLabel("completed")).toBe("Ver reporte");
  });
});
