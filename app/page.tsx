// Placeholder Home page. Replaced section by section once the design guide
// arrives. Pre-rendered at build time, so visits don't render on the Worker.
export const dynamic = "force-static";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold">Home Furnishing Showroom</h1>
      <p className="mt-4 text-lg text-slate-700">Website in progress.</p>
    </main>
  );
}
