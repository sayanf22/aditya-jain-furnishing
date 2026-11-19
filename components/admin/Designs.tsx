"use client";

// Designs: every product, filtered by collection or type, with search.
import { useMemo, useState } from "react";
import type { AdminCategory, AdminProduct, Page } from "@/lib/admin-api";
import { api, asFailure, query } from "./api";
import { designPlaces, filterOptions } from "./catalogue-utils";
import { DesignEditor } from "./DesignEditor";
import { plural } from "./format";
import { useDebounced, usePaged, useResource } from "./hooks";
import { IconChevron, IconEye, IconEyeOff, IconPlus, IconSearch } from "./icons";
import { Photo } from "./Photo";
import { Badge, Button, ConfirmDialog, Empty, ErrorNote, IconButton, Loading, PageHeader, Select, TextInput, cx, useToast } from "./ui";

type Catalogue = { categories: AdminCategory[]; totalProducts: number };
type Editing = { type: "new" } | { type: "edit"; id: number };

export function DesignsScreen() {
  const toast = useToast();
  const catalogue = useResource<Catalogue>("/catalogue");
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const q = useDebounced(search.trim());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [deleting, setDeleting] = useState<AdminProduct | null>(null);
  const [clearing, setClearing] = useState(false);

  const [scope, id] = filter.split(":");
  const products = usePaged<AdminProduct>(
    `/products${query({ categoryId: scope === "c" ? id : null, subcategoryId: scope === "s" ? id : null, q, limit: 50 })}`,
  );
  const samples = useResource<Page<AdminProduct>>("/products?sample=1&limit=200");

  const categories = catalogue.data?.categories;
  const places = useMemo(() => (categories ? designPlaces(categories) : []), [categories]);
  const options = useMemo(() => (categories ? filterOptions(categories) : []), [categories]);
  const placeLabel = useMemo(() => new Map(places.map((place) => [place.value, place.label])), [places]);

  if (catalogue.error && !catalogue.data) return <ErrorNote error={catalogue.error} onRetry={catalogue.reload} />;
  if (!categories) return <Loading />;

  const sampleCount = samples.data?.items.length ?? 0;
  const sampleLabel = samples.data?.nextCursor ? `${sampleCount}+` : String(sampleCount);
  const editingProduct = editing?.type === "edit" ? products.items.find((item) => item.id === editing.id) ?? null : null;
  const defaultPlace = places.find((place) => (scope === "c" ? place.categoryId === Number(id) : scope === "s" ? place.subcategoryId === Number(id) : false))?.value;

  async function toggle(product: AdminProduct) {
    const visible = !product.visible;
    products.mutate((items) => items.map((item) => (item.id === product.id ? { ...item, visible } : item)));
    try {
      await api.patch(`/products/${product.id}`, { visible });
    } catch (error) {
      toast(asFailure(error).message, "error");
      products.reload();
    }
  }

  function refresh() {
    products.reload();
    samples.reload();
    catalogue.reload();
  }

  return (
    <>
      <PageHeader title="Designs">
        {sampleCount > 0 && (
          <Button variant="ghost" onClick={() => setClearing(true)}>
            Remove samples
          </Button>
        )}
        <Button variant="primary" icon={<IconPlus />} onClick={() => setEditing({ type: "new" })} disabled={places.length === 0}>
          Add design
        </Button>
      </PageHeader>

      <div className="a-toolbar">
        <Select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Collection">
          <option value="">All designs ({catalogue.data?.totalProducts ?? 0})</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <label className="a-search">
          <IconSearch />
          <TextInput type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search designs" aria-label="Search designs" />
        </label>
      </div>

      {products.error ? (
        <ErrorNote error={products.error} onRetry={products.reload} />
      ) : products.loading && products.items.length === 0 ? (
        <Loading />
      ) : products.items.length === 0 ? (
        <Empty
          title={q ? "No designs found" : "No designs here yet"}
          action={
            !q && places.length > 0 ? (
              <Button variant="primary" icon={<IconPlus />} onClick={() => setEditing({ type: "new" })}>
                Add design
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className={cx("a-card a-card--flush a-list", products.loading && "is-refreshing")}>
            {products.items.map((product) => {
              const cover = [...product.images].sort((a, b) => a.position - b.position)[0];
              return (
                <li key={product.id} className={cx("a-row", !product.visible && "is-hidden")}>
                  <button type="button" className="a-row__main" onClick={() => setEditing({ type: "edit", id: product.id })}>
                    <span className="a-row__thumb">
                      <Photo mediaKey={cover?.mediaKey} alt="" width={480} />
                    </span>
                    <span className="a-row__text">
                      <span className="a-row__name">{product.name}</span>
                      <span className="a-row__meta">
                        {placeLabel.get(`${product.categoryId}:${product.subcategoryId ?? 0}`) ?? ""}
                        {product.isSample && <Badge>Sample</Badge>}
                        {!product.visible && <Badge>Hidden</Badge>}
                      </span>
                    </span>
                  </button>
                  <div className="a-row__actions">
                    <span className="a-row__count">{plural(product.images.length, "photo")}</span>
                    <IconButton label={product.visible ? `Hide ${product.name}` : `Show ${product.name}`} onClick={() => void toggle(product)} aria-pressed={!product.visible}>
                      {product.visible ? <IconEye /> : <IconEyeOff />}
                    </IconButton>
                    <IconButton label={`Edit ${product.name}`} onClick={() => setEditing({ type: "edit", id: product.id })}>
                      <IconChevron />
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
          {products.hasMore && (
            <div className="a-more-row">
              <Button onClick={() => void products.loadMore()} busy={products.loadingMore}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}

      {editing && (editing.type === "new" || editingProduct) && (
        <DesignEditor
          key={editing.type === "new" ? "new" : editing.id}
          product={editingProduct}
          places={places}
          defaultPlace={defaultPlace}
          onClose={() => setEditing(null)}
          onSaved={refresh}
          onDelete={(product) => {
            setEditing(null);
            setDeleting(product);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          actionLabel="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await api.del(`/products/${deleting.id}`);
            toast(`Deleted “${deleting.name}”`);
            refresh();
          }}
        >
          <p>The design is removed from the site. Its photos stay in your library.</p>
        </ConfirmDialog>
      )}

      {clearing && (
        <ConfirmDialog
          title="Remove all sample designs?"
          typed="remove"
          actionLabel="Remove"
          onClose={() => setClearing(false)}
          onConfirm={async () => {
            const result = await api.del<{ removed: number }>("/products/sample");
            toast(`Removed ${plural(result.removed, "sample design")}`);
            refresh();
          }}
        >
          <p>{sampleLabel} sample designs will be deleted. Designs you added yourself stay.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
