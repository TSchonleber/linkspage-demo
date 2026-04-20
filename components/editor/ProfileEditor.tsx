"use client";

import { ChangeEvent, useState } from "react";

import { usePageStore } from "@/lib/store";

const MAX_BIO_LENGTH = 160;
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read selected image file."));
    reader.readAsDataURL(file);
  });
}

function initialsFromName(name: string): string {
  const chunks = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (chunks.length === 0) {
    return "U";
  }

  return chunks.map((chunk) => chunk[0]?.toUpperCase() ?? "").join("");
}

export function ProfileEditor() {
  const name = usePageStore((state) => state.page.name);
  const bio = usePageStore((state) => state.page.bio);
  const avatar = usePageStore((state) => state.page.avatar);
  const setName = usePageStore((state) => state.setName);
  const setBio = usePageStore((state) => state.setBio);
  const setAvatar = usePageStore((state) => state.setAvatar);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const remaining = MAX_BIO_LENGTH - bio.length;

  async function handleAvatarUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!ACCEPTED_MIME_TYPES.has(file.type)) {
      setAvatarError("Avatar must be a JPG, PNG, or WEBP image.");
      event.target.value = "";
      return;
    }

    if (file.size > MAX_AVATAR_BYTES) {
      setAvatarError("Avatar must be 2MB or smaller.");
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setAvatar(dataUrl);
      setAvatarError(null);
    } catch {
      setAvatarError("Could not process that image. Try a different file.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-4">
        <h2 className="text-sm font-semibold tracking-wide text-slate-900">Profile</h2>
        <p className="text-xs text-slate-500">Your public identity on the page.</p>
      </header>

      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-700">Name</span>
          <input
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ada Lovelace"
            type="text"
            value={name}
          />
        </label>

        <label className="block space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-700">Bio</span>
            <span
              className={`text-[11px] ${
                remaining <= 10 ? "text-amber-600" : "text-slate-500"
              }`}
            >
              {bio.length}/{MAX_BIO_LENGTH}
            </span>
          </div>
          <textarea
            className="min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            maxLength={MAX_BIO_LENGTH}
            onChange={(event) => setBio(event.target.value)}
            placeholder="Short headline about what you build, share, or care about."
            rows={4}
            value={bio}
          />
        </label>

        <div className="space-y-2">
          <span className="text-xs font-medium text-slate-700">Avatar</span>
          <div className="flex items-center gap-3">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-sm font-semibold text-slate-700">
              {avatar ? (
                <img
                  alt="Avatar preview"
                  className="size-full object-cover"
                  src={avatar}
                />
              ) : (
                initialsFromName(name)
              )}
            </div>
            <div className="space-y-1">
              <input
                accept="image/jpeg,image/png,image/webp"
                className="block text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-xs file:font-medium file:text-white hover:file:bg-slate-700"
                onChange={handleAvatarUpload}
                type="file"
              />
              <p className="text-[11px] text-slate-500">JPG, PNG, or WEBP up to 2MB.</p>
              {avatar && (
                <button
                  className="text-[11px] font-medium text-slate-700 underline decoration-slate-300 underline-offset-2 hover:text-slate-900"
                  onClick={() => setAvatar("")}
                  type="button"
                >
                  Remove avatar
                </button>
              )}
            </div>
          </div>
          {avatarError ? <p className="text-xs text-red-600">{avatarError}</p> : null}
        </div>
      </div>
    </section>
  );
}
