import { createFileRoute } from "@tanstack/react-router";
import { PosShell } from "@/components/pos-shell";
import { SalesList } from "@/components/sales-list";

export const Route = createFileRoute("/_authenticated/pos/voided")({
  head: () => ({
    meta: [
      { title: "Invalidated Sales — Point of Sale" },
      { name: "description", content: "Sales that were voided, with the reason recorded." },
      { property: "og:title", content: "Invalidated Sales — Point of Sale" },
      { property: "og:description", content: "Review voided sales and returned stock." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <PosShell title="Invalidated sales" subtitle="Voided sales — their stock has been returned">
      <SalesList view="voided" />
    </PosShell>
  ),
});
