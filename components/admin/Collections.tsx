"use client";

// Collections: the same tree the public site shows, with controls to add,
// rename, describe, photograph, show or hide, reorder and delete.
import { useState } from "react";
import type { AdminCategory } from "@/lib/admin-api";
import { api, asFailure } from "./api";
import { CollectionEditor, type EditorMode } from "./CollectionEditor";
import {
  countTypes,
  findNode,
  fromCategory,
  fromSub,
  movedIds,
  nodeKey,
  patchNode,
  reorderSiblings,
  type NodeKind,
  type Scope,
  type TreeNode,
} from "./catalogue-utils";
import { FlipList } from "./FlipList";
import { plural } from "./format";
import { useResource } from "./hooks";
import { IconChevron, IconDown, IconEye, IconEyeOff, IconPlus, IconUp } from "./icons";
import { Photo } from "./Photo";
import { Badge, Button, ConfirmDialog, Empty, ErrorNote, IconButton, Loading, PageHeader, cx, useToast } from "./ui";

type Catalogue = { categories: AdminCategory[]; totalProducts: number };
type Target = { type: "edit"; kind: NodeKind; id: number } | { type: "create"; parent: TreeNode | null };

export function CollectionsScreen() {
  const toast = useToast();
  const catalogue = useResource<Catalogue>("/catalogue");
  const { data, mutate, reload } = catalogue;
  const [target, setTarget] = useState<Target | null>(null);
  const [deleting, setDeleting] = useState<TreeNode | null>(null);
  const [folded, setFolded] = useState<Set<string>>(new Set());

  if (catalogue.error && !data) return <ErrorNote error={catalogue.error} onRetry={reload} />;
  if (!data) return <Loading />;

  const categories = data.categories;

  async function reorder(scope: Scope, ids: number[]) {
    mutate((current) => ({ ...current, categories: reorderSiblings(current.categories, scope, ids) }));
    try {
      if (scope.categoryId === null) await api.post("/categories/reorder", { ids });
      else await api.post("/subcategories/reorder", { categoryId: scope.categoryId, parentId: scope.parentId, ids });
    } catch (error) {
      toast(asFailure(error).message, "error");
      reload();
    }
  }

  async function toggleVisible(node: TreeNode) {
    const visible = !node.visible;
    mutate((current) => ({ ...current, categories: patchNode(current.categories, node.kind, node.id, { visible }) }));
    try {
      await api.patch(`/${node.kind === "category" ? "categories" : "subcategories"}/${node.id}`, { visible });
    } catch (error) {
      toast(asFailure(error).message, "error");
      reload();
    }
  }

  async function remove(node: TreeNode) {
    const path = node.kind === "category" ? "categories" : "subcategories";
    await api.del(`/${path}/${node.id}?confirm=${encodeURIComponent(node.name)}`);
    toast(`Deleted “${node.name}”`);
    reload();
  }

  const fold = (key: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  let mode: EditorMode | null = null;
  if (target?.type === "create") mode = target;
  else if (target) {
    const node = findNode(categories, target.kind, target.id);
    if (node) mode = { type: "edit", node };
  }

  return (
    <>
      <PageHeader title="Collections">
        <Button variant="primary" icon={<IconPlus />} onClick={() => setTarget({ type: "create", parent: null })}>
          Add collection
        </Button>
      </PageHeader>

      {categories.length === 0 ? (
        <Empty title="No collections yet" action={<Button variant="primary" onClick={() => setTarget({ type: "create", parent: null })}>Add collection</Button>}>
          Start with the first one.
        </Empty>
      ) : (
        <div className={cx("a-card a-card--flush", catalogue.loading && "is-refreshing")}>
          <Branch
            nodes={categories.map(fromCategory)}
            scope={{ categoryId: null, parentId: null }}
            depth={0}
            folded={folded}
            onFold={fold}
            onOpen={(node) => setTarget({ type: "edit", kind: node.kind, id: node.id })}
            onAdd={(parent) => setTarget({ type: "create", parent })}
            onMove={reorder}
            onToggle={toggleVisible}
          />
        </div>
      )}

      {mode && (
        <CollectionEditor
          key={mode.type === "edit" ? nodeKey(mode.node.kind, mode.node.id) : `new-${mode.parent ? nodeKey(mode.parent.kind, mode.parent.id) : "top"}`}
          mode={mode}
          onClose={() => setTarget(null)}
          onSaved={(created) => {
            reload();
            if (created) setTarget({ type: "edit", kind: created.kind, id: created.id });
          }}
          onAddChild={(parent) => setTarget({ type: "create", parent })}
          onDelete={(node) => {
            setTarget(null);
            setDeleting(node);
          }}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={`Delete “${deleting.name}”?`}
          typed={deleting.name}
          actionLabel="Delete"
          onClose={() => setDeleting(null)}
          onConfirm={() => remove(deleting)}
        >
          <p>
            {(() => {
              const types = countTypes(deleting.children);
              const parts = [types ? plural(types, "type") : "", deleting.productCount ? plural(deleting.productCount, "design") : ""].filter(Boolean);
              return parts.length ? `This also deletes ${parts.join(" and ")} inside it.` : "Nothing else is inside it.";
            })()}{" "}
            Photos stay in your library.
          </p>
        </ConfirmDialog>
      )}
    </>
  );
}

type BranchProps = {
  nodes: TreeNode[];
  scope: Scope;
  depth: number;
  folded: Set<string>;
  onFold: (key: string) => void;
  onOpen: (node: TreeNode) => void;
  onAdd: (parent: TreeNode) => void;
  onMove: (scope: Scope, ids: number[]) => void;
  onToggle: (node: TreeNode) => void;
};

function Branch({ nodes, scope, depth, folded, onFold, onOpen, onAdd, onMove, onToggle }: BranchProps) {
  const ids = nodes.map((node) => node.id);
  return (
    <FlipList className={cx("a-tree", depth > 0 && "a-tree--kids")} order={ids.join(",")}>
      {nodes.map((node, index) => {
        const key = nodeKey(node.kind, node.id);
        const hasKids = node.children.length > 0;
        const open = !folded.has(key);
        const childScope: Scope = { categoryId: node.categoryId, parentId: node.kind === "sub" ? node.id : null };
        return (
          <li key={key} data-flip={node.id} className="a-tree__item">
            <div className={cx("a-row", !node.visible && "is-hidden")}>
              {hasKids ? (
                <IconButton label={open ? `Close ${node.name}` : `Open ${node.name}`} className={cx("a-row__fold", open && "is-open")} onClick={() => onFold(key)} aria-expanded={open}>
                  <IconChevron />
                </IconButton>
              ) : (
                <span className="a-row__fold" aria-hidden="true" />
              )}
              <button type="button" className="a-row__main" onClick={() => onOpen(node)}>
                <span className="a-row__thumb">
                  <Photo mediaKey={node.imageKey} alt="" width={480} />
                </span>
                <span className="a-row__text">
                  <span className="a-row__name">{node.name}</span>
                  <span className="a-row__meta">
                    {hasKids ? `${plural(node.children.length, "type")} · ` : ""}
                    {plural(node.productCount, "design")}
                    {!node.visible && <Badge>Hidden</Badge>}
                  </span>
                </span>
              </button>
              <div className="a-row__actions">
                <IconButton label={`Move ${node.name} up`} disabled={index === 0} onClick={() => onMove(scope, movedIds(ids, node.id, -1))}>
                  <IconUp />
                </IconButton>
                <IconButton label={`Move ${node.name} down`} disabled={index === nodes.length - 1} onClick={() => onMove(scope, movedIds(ids, node.id, 1))}>
                  <IconDown />
                </IconButton>
                <IconButton label={node.visible ? `Hide ${node.name}` : `Show ${node.name}`} onClick={() => onToggle(node)} aria-pressed={!node.visible}>
                  {node.visible ? <IconEye /> : <IconEyeOff />}
                </IconButton>
                <IconButton label={`Add a type inside ${node.name}`} className="a-row__add" onClick={() => onAdd(node)}>
                  <IconPlus />
                </IconButton>
              </div>
            </div>
            {hasKids && (
              <div className="a-collapse" data-open={open}>
                <div className="a-collapse__inner" inert={!open}>
                  <Branch
                    nodes={node.children.map(fromSub)}
                    scope={childScope}
                    depth={depth + 1}
                    folded={folded}
                    onFold={onFold}
                    onOpen={onOpen}
                    onAdd={onAdd}
                    onMove={onMove}
                    onToggle={onToggle}
                  />
                </div>
              </div>
            )}
          </li>
        );
      })}
    </FlipList>
  );
}
