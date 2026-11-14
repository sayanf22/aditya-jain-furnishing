"use client";

// The collection tree, drawn with thread lines (├ and └) joining each type
// to the one it sits in. The branch the visitor is in starts open and the
// threads leading to the current page are red, so "where am I" can be read
// at a glance. Any branch opens or closes with the chevron, sliding open
// (grid rows 0fr → 1fr, so no height is measured in JavaScript); names are
// links. Desktop shows it as a sticky sidebar; phones get it under a
// "Browse collections" bar that slides open the same way.
import { useId, useState } from "react";
import { ChevronDownIcon } from "../icons";

export type TreeNode = { id: number; name: string; href: string; count: number; children: TreeNode[] };

const onPath = (n: TreeNode, current: string) => n.href === current || current.startsWith(`${n.href}/`);

function collectOpen(nodes: TreeNode[], current: string, out: Set<number>) {
  for (const n of nodes) {
    if (n.children.length && onPath(n, current)) {
      out.add(n.id);
      collectOpen(n.children, current, out);
    }
  }
  return out;
}

export function CollectionTree({ nodes, current }: { nodes: TreeNode[]; current: string }) {
  const [open, setOpen] = useState(() => collectOpen(nodes, current, new Set()));
  const toggle = (id: number) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <ul className="tree-root space-y-0.5">
      {nodes.map((n) => (
        <Item key={n.id} node={n} current={current} open={open} toggle={toggle} depth={0} />
      ))}
    </ul>
  );
}

function Item({ node, current, open, toggle, depth }: { node: TreeNode; current: string; open: Set<number>; toggle: (id: number) => void; depth: number }) {
  const here = node.href === current;
  const path = !here && onPath(node, current);
  const isOpen = open.has(node.id);
  const kids = useId();
  return (
    <li className={`tree-item ${here || path ? "on-path" : ""}`}>
      <div className="flex items-center gap-1">
        <a
          href={node.href}
          aria-current={here ? "page" : undefined}
          className={`tree-link flex min-w-0 flex-1 items-start justify-between gap-3 rounded-xl px-3 py-2 leading-snug ${depth === 0 ? "text-[0.95rem]" : "text-[0.9rem]"} ${
            here ? "tree-here font-medium text-terracotta" : path ? "font-medium text-ink" : "text-ink-soft hover:text-ink"
          }`}
        >
          <span className="min-w-0">{node.name}</span>
          <span className={`mt-[0.15em] shrink-0 text-[0.75rem] font-normal tabular-nums ${here ? "text-terracotta/70" : "text-muted"}`}>{node.count}</span>
        </a>
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={() => toggle(node.id)}
            aria-expanded={isOpen}
            aria-controls={kids}
            aria-label={`${isOpen ? "Close" : "Open"} ${node.name}`}
            className="tree-toggle flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink"
          >
            <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
          </button>
        ) : (
          <span className="w-8 shrink-0" aria-hidden="true" />
        )}
      </div>
      {node.children.length > 0 && (
        <div id={kids} className="tree-kids" data-open={isOpen}>
          <div className="min-h-0 overflow-hidden">
            <ul className="tree-branch" inert={!isOpen}>
              {node.children.map((c) => (
                <Item key={c.id} node={c} current={current} open={open} toggle={toggle} depth={depth + 1} />
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

/** Phones and tablets: the tree under a bar that slides it open. */
export function CollectionMenu({ nodes, current, here }: { nodes: TreeNode[]; current: string; here: string }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  return (
    <div className={`collection-menu rounded-2xl border bg-white transition-[border-color,box-shadow] duration-300 lg:hidden ${open ? "border-ink/20 shadow-[0_18px_40px_-28px_rgba(20,20,20,0.45)]" : "border-ink/12"}`}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={panel} className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left">
        <span className="min-w-0">
          <span className="block text-[0.7rem] font-semibold tracking-[0.18em] text-muted uppercase">Browse collections</span>
          <span className="mt-0.5 block truncate text-[0.92rem] font-medium">{here}</span>
        </span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ${open ? "bg-ink text-ivory" : "bg-sand text-ink"}`}>
          <ChevronDownIcon className={`h-4 w-4 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      <div id={panel} className="tree-kids" data-open={open}>
        <div className="min-h-0 overflow-hidden">
          <nav aria-label="Collections" className="border-t border-ink/10 px-2 pt-3 pb-4" inert={!open}>
            <CollectionTree nodes={nodes} current={current} />
          </nav>
        </div>
      </div>
    </div>
  );
}
