import type { Metadata } from "next";
import Link from "next/link";
import { BioPage } from "@/components/preview/BioPage";
import { fetchPage } from "@/lib/api";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await fetchPage(slug);
  if (!page) return { title: "Not found" };
  return { title: `${page.name || "linkspage"} — linkspage` };
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = await fetchPage(slug);

  if (!page) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-neutral-500">
          This link page doesn&apos;t exist or may have been removed.
        </p>
        <Link
          href="/"
          className="mt-2 rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700 transition"
        >
          Create your own
        </Link>
      </div>
    );
  }

  return <BioPage page={page} />;
}
