import { createFileRoute } from "@tanstack/react-router";
import { PosShell } from "@/components/pos-shell";
import { SalesList } from "@/components/sales-list";

export const Route = createFileRoute("/_authenticated/pos/sales")({
  head: () => ({
    meta: [
      { title: "All Sales — Point of Sale" },
      {
        name: "description",
        content: "Every counter sale with its invoice number, total and status.",
      },
      { property: "og:title", content: "All Sales — Point of Sale" },
      { property: "og:description", content: "Browse, filter and settle counter sales." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <PosShell title="All sales" subtitle="Every sale recorded at this branch's counter">
      <SalesList view="all" />
    </PosShell>
  ),
});
