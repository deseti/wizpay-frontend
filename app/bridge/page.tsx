"use client";

import { BridgeScreen } from "@/components/dashboard/BridgeScreen";
import { DashboardAppFrame } from "@/components/dashboard/DashboardAppFrame";

export default function BridgePage() {
  return (
    <DashboardAppFrame>
      <BridgeScreen />
    </DashboardAppFrame>
  );
}