"use client";

import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { usePageStore } from "@/lib/store";

import { LinkRow } from "./LinkRow";

export function LinksEditor() {
  const links = usePageStore((state) => state.page.links);
  const reorderLinks = usePageStore((state) => state.reorderLinks);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    reorderLinks(String(active.id), String(over.id));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-4">
        <h2 className="text-sm font-semibold tracking-wide text-slate-900">Links</h2>
        <p className="text-xs text-slate-500">
          Reorder with drag-and-drop or keyboard controls.
        </p>
      </header>

      {links.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
          No links yet. Add your first one below.
        </div>
      ) : (
        <DndContext
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          sensors={sensors}
        >
          <SortableContext
            items={links.map((link) => link.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {links.map((link) => (
                <LinkRow key={link.id} link={link} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
