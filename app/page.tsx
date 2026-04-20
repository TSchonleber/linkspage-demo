"use client";

import { AddLinkForm } from "@/components/editor/AddLinkForm";
import { LinksEditor } from "@/components/editor/LinksEditor";
import { ProfileEditor } from "@/components/editor/ProfileEditor";
import { ThemePicker } from "@/components/editor/ThemePicker";
import { BioPage } from "@/components/preview/BioPage";
import { ExportPngButton } from "@/components/share/ExportPngButton";
import { PublishButton } from "@/components/share/PublishButton";
import { QrButton } from "@/components/share/QrButton";
import { Toaster } from "@/components/ui/sonner";
import { usePageStore } from "@/lib/store";

export default function Home() {
  const page = usePageStore((s) => s.page);

  return (
    <>
      {/* Toast notifications — layout.tsx has no Toaster, so mount it here */}
      <Toaster position="bottom-right" richColors />

      <div className="flex min-h-screen flex-col bg-[#f5f5f4]">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-stone-200 bg-white/90 px-5 backdrop-blur-sm">
          <span className="text-sm font-semibold tracking-tight text-stone-900">
            linkspage
          </span>

          <div className="flex items-center gap-2">
            <QrButton />
            <ExportPngButton />
            <PublishButton />
          </div>
        </header>

        {/* Two-column editor + preview */}
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[440px_1fr]">
          {/* Left — editor (scrollable) */}
          <aside className="overflow-y-auto border-r border-stone-200 bg-white">
            <div className="space-y-5 p-6">
              <ProfileEditor />
              <ThemePicker />
              <LinksEditor />
              <AddLinkForm />
            </div>
          </aside>

          {/* Right — live preview */}
          <section className="flex flex-col">
            {/* Preview header strip */}
            <div className="flex h-10 items-center border-b border-stone-200 px-5">
              <span className="text-xs font-medium uppercase tracking-widest text-stone-400">
                Preview
              </span>
            </div>

            {/* BioPage fills remaining height and centers the card */}
            <div className="flex flex-1 items-start justify-center overflow-y-auto p-8">
              <div className="w-full max-w-md">
                <BioPage page={page} />
              </div>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
