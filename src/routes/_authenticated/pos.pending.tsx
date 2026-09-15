import { createFileRoute } from "@tanstack/react-router";
import { PosShell } from "@/components/pos-shell";
import { SalesList } from "@/components/sales-list";

export const Route = createFileRoute("/_authenticated/pos/pending")({
  head: () => ({
    meta: [
      { title: "Pending Sales — Point of Sale" },
      { name: "description", content: "Credit sales still waiting to be paid for." },
      { property: "og:title", content: "Pending Sales — Point of Sale" },
      { property: "og:description", content: "Track and settle unpaid credit sales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <PosShell title="Pending sales" subtitle="Credit sales awaiting payment">
      <SalesList view="pending_payment" />
    </PosShell>
  ),
});
