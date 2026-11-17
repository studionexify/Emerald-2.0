/** Nexcal · FDM — the studio's pricing calculator (same engine as Emerald 1). The calculator itself is routes/nexcal/Workbench; Nexder uses it too. */
import { CALC_TABS } from "../nav";
import { lazy } from "../router";
import { Page } from "../ui";
import type { WorkbenchProps } from "./nexcal/Workbench";

const Workbench = lazy<WorkbenchProps>(() => import("./nexcal/Workbench").then((m) => m.Workbench));

export function Nexcal() {
  return (
    <Page title="Nexcal" sub="Cost-plus pricing, machine-time economics and bulk tiers" tabs={CALC_TABS}>
      <Workbench mode="page" />
    </Page>
  );
}
