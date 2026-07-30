import Link from "next/link";
import { ChevronLeft, ChevronRight, LayoutGrid, List } from "lucide-react";
import { requireUser } from "@/lib/auth-helpers";
import { listProperties, getLocalitiesForUser } from "@/lib/queries/inventory";
import { inventoryFilterSchema } from "@/lib/validation/property";
import { parseListParams, INVENTORY_ARRAY_KEYS } from "@/lib/search-params";
import { cityLabel, attachmentUrl, formatPrice, propertyTitle } from "@/lib/domain";
import { InventoryFilters } from "@/components/inventory/InventoryFilters";
import { InventorySearch } from "@/components/inventory/InventorySearch";
import { InventorySort } from "@/components/inventory/InventorySort";
import { PropertyCard } from "@/components/inventory/PropertyCard";
import { StatusBadge } from "@/components/inventory/StatusBadge";
import { TableRowLink } from "@/components/TableRowLink";
import { BulkSelectProvider, BulkSelectAll, BulkRowCheckbox } from "@/components/BulkSelect";
import { bulkDeletePropertiesAction } from "@/app/(app)/inventory/actions";

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const sp = await searchParams;
  const filter = parseListParams(inventoryFilterSchema, sp, INVENTORY_ARRAY_KEYS);

  const [{ items, total, page, pageCount }, localities] = await Promise.all([
    listProperties(user, filter),
    getLocalitiesForUser(user),
  ]);

  function pageHref(p: number) {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v === "string") next.set(k, v);
      else if (Array.isArray(v)) for (const item of v) next.append(k, item);
    }
    next.set("page", String(p));
    return `/inventory?${next.toString()}`;
  }

  // Grid (cards) vs list (table) view — a plain UI param preserved across filters/pages.
  const view = sp.view === "list" ? "list" : "grid";
  function viewHref(v: "grid" | "list") {
    const next = new URLSearchParams();
    for (const [k, val] of Object.entries(sp)) {
      if (k === "view") continue;
      if (typeof val === "string") next.set(k, val);
      else if (Array.isArray(val)) for (const item of val) next.append(k, item);
    }
    if (v === "list") next.set("view", "list");
    const qs = next.toString();
    return `/inventory${qs ? `?${qs}` : ""}`;
  }

  // Windowed page numbers: anchor the window at the current page and show up to
  // WINDOW pages forward (current + next 4), so any of the next pages is one click
  // away. Near the last page the window shifts back so it always shows WINDOW pages.
  const WINDOW = 5;
  const windowStart = Math.max(1, Math.min(page, pageCount - WINDOW + 1));
  const windowEnd = Math.min(pageCount, windowStart + WINDOW - 1);
  const pageNumbers: number[] = [];
  for (let p = windowStart; p <= windowEnd; p++) pageNumbers.push(p);

  const scopeLabel =
    user.role === "ADMIN"
      ? "across all cities"
      : `in ${user.cities.map((c) => cityLabel[c]).join(" & ")}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Inventory</h1>
          <div className="subtitle">
            {total} {total === 1 ? "property" : "properties"} {scopeLabel}
          </div>
        </div>
        <div className="page-actions">
          {user.role === "ADMIN" && (
            <Link href="/inventory/import" className="btn">
              Import Excel
            </Link>
          )}
          <Link href="/inventory/new" className="btn-primary">
            + Add Property
          </Link>
        </div>
      </div>

      <div className="inventory-shell">
        <InventoryFilters localities={localities} isAdmin={user.role === "ADMIN"} />

        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <div style={{ flex: 1, minWidth: 240 }}>
              <InventorySearch key={filter.search ?? ""} initialSearch={filter.search} />
            </div>
            <InventorySort />
            {/* Grid / list view toggle */}
            <div
              style={{
                display: "inline-flex",
                border: "1px solid var(--rule)",
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
              }}
            >
              <Link
                href={viewHref("grid")}
                aria-label="Grid view"
                title="Grid view"
                className="icon-btn"
                style={{
                  border: "none",
                  borderRadius: 0,
                  color: view === "grid" ? "var(--brand)" : "var(--ink-soft)",
                  background: view === "grid" ? "var(--bg-soft)" : "white",
                }}
              >
                <LayoutGrid className="h-4 w-4" />
              </Link>
              <Link
                href={viewHref("list")}
                aria-label="List view"
                title="List view"
                className="icon-btn"
                style={{
                  border: "none",
                  borderLeft: "1px solid var(--rule)",
                  borderRadius: 0,
                  color: view === "list" ? "var(--brand)" : "var(--ink-soft)",
                  background: view === "list" ? "var(--bg-soft)" : "white",
                }}
              >
                <List className="h-4 w-4" />
              </Link>
            </div>
          </div>

          {items.length === 0 ? (
            <div className="card card-pad" style={{ textAlign: "center", color: "var(--ink-fade)", padding: 48 }}>
              No properties match these filters.
            </div>
          ) : view === "list" ? (
            <BulkSelectProvider
              entity="properties"
              pageIds={items.map((p) => p.id)}
              total={total}
              filterParams={sp}
              deleteAction={bulkDeletePropertiesAction}
              canDelete={isAdmin}
            >
            <div className="card" style={{ overflow: "hidden" }}>
              <div className="table-wrap">
                <table className="lead-table assign-table">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }}>
                        <BulkSelectAll />
                      </th>
                      <th aria-label="Photo"></th>
                      <th>File no</th>
                      <th>Property</th>
                      <th>Location</th>
                      <th>Price</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((p) => {
                      const img = p.attachments.find((a) => a.mimeType.startsWith("image/"));
                      return (
                        <TableRowLink key={p.id} href={`/inventory/${p.id}`}>
                          <BulkRowCheckbox id={p.id} />
                          <td>
                            {img ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={attachmentUrl(img.id)}
                                alt=""
                                style={{ width: 46, height: 34, objectFit: "cover", borderRadius: 4, display: "block" }}
                              />
                            ) : (
                              <div style={{ width: 46, height: 34, borderRadius: 4, background: "var(--bg-soft)" }} />
                            )}
                          </td>
                          <td>
                            <span className="source-tag">{p.fileNo}</span>
                          </td>
                          <td>
                            <b style={{ color: "var(--ink)" }}>
                              {propertyTitle({ bhk: p.bhk, propertyType: p.propertyType, localityName: p.locality.name })}
                            </b>
                          </td>
                          <td style={{ color: "var(--ink-soft)" }}>
                            {p.locality.name}, {cityLabel[p.city]}
                          </td>
                          <td style={{ fontWeight: 600, color: "var(--brand-dark)", whiteSpace: "nowrap" }}>
                            {formatPrice(Number(p.priceInr), p.transactionType)}
                          </td>
                          <td>
                            <StatusBadge status={p.availabilityStatus} />
                          </td>
                        </TableRowLink>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
            </BulkSelectProvider>
          ) : (
            <>
              <p style={{ fontSize: 12, color: "var(--ink-fade)", margin: "0 0 10px" }}>
                Tip: switch to list view (top-right) to select and download multiple property portfolios.
              </p>
              <div className="property-grid">
              {items.map((p) => (
                <PropertyCard
                  key={p.id}
                  p={{
                    id: p.id,
                    fileNo: p.fileNo,
                    propertyType: p.propertyType,
                    transactionType: p.transactionType,
                    availabilityStatus: p.availabilityStatus,
                    buildingClassification: p.buildingClassification,
                    bhk: p.bhk,
                    builtUpAreaSqft: p.builtUpAreaSqft,
                    parkingCount: p.parkingCount,
                    facing: p.facing,
                    ageYears: p.ageYears,
                    furnishing: p.furnishing,
                    priceInr: Number(p.priceInr),
                    localityName: p.locality.name,
                    images: p.attachments
                      .filter((a) => a.mimeType.startsWith("image/"))
                      .map((a) => ({ id: a.id, url: attachmentUrl(a.id) })),
                    docs: p.attachments
                      .filter((a) => a.mimeType === "application/pdf")
                      .map((a) => ({ id: a.id, name: a.originalFilename })),
                  }}
                />
              ))}
              </div>
            </>
          )}

          {pageCount > 1 && (
            <nav
              aria-label="Inventory pagination"
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, flexWrap: "wrap" }}
            >
              {/* Previous page */}
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="btn btn-sm" aria-label="Previous page">
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              ) : (
                <span className="btn btn-sm" style={{ opacity: 0.4, pointerEvents: "none" }} aria-hidden="true">
                  <ChevronLeft className="h-4 w-4" />
                </span>
              )}

              {/* Jump to first page + leading ellipsis when the window has moved past page 1 */}
              {windowStart > 1 && (
                <>
                  <Link href={pageHref(1)} className="btn btn-sm">
                    1
                  </Link>
                  {windowStart > 2 && (
                    <span style={{ color: "var(--ink-fade)", padding: "0 2px" }}>…</span>
                  )}
                </>
              )}

              {/* Windowed page numbers (current page highlighted, not a link) */}
              {pageNumbers.map((p) =>
                p === page ? (
                  <span key={p} className="btn-primary btn-sm" aria-current="page" style={{ pointerEvents: "none" }}>
                    {p}
                  </span>
                ) : (
                  <Link key={p} href={pageHref(p)} className="btn btn-sm" aria-label={`Page ${p}`}>
                    {p}
                  </Link>
                ),
              )}

              {/* Trailing ellipsis + jump to last page when more pages exist beyond the window */}
              {windowEnd < pageCount && (
                <>
                  {windowEnd < pageCount - 1 && (
                    <span style={{ color: "var(--ink-fade)", padding: "0 2px" }}>…</span>
                  )}
                  <Link href={pageHref(pageCount)} className="btn btn-sm">
                    {pageCount}
                  </Link>
                </>
              )}

              {/* Next page */}
              {page < pageCount ? (
                <Link href={pageHref(page + 1)} className="btn btn-sm" aria-label="Next page">
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ) : (
                <span className="btn btn-sm" style={{ opacity: 0.4, pointerEvents: "none" }} aria-hidden="true">
                  <ChevronRight className="h-4 w-4" />
                </span>
              )}
            </nav>
          )}
        </div>
      </div>
    </div>
  );
}
