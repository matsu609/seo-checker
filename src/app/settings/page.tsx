import type { Metadata } from "next";
import { requireFeature } from "@/lib/features/registry";
import { SettingsView } from "./SettingsView";

const feature = requireFeature("settings");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return <SettingsView />;
}
