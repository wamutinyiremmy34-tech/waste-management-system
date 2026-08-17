import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1">
      <section className="bg-gradient-to-b from-[#1b4332] to-[#2d6a4f] text-white">
        <div className="mx-auto max-w-5xl px-6 py-24 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-emerald-200">
            Oars Technologies · Uganda
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">EcoTrack</h1>
          <p className="mt-4 text-lg text-emerald-50">
            A digital operating system for waste management — connecting citizens, collectors,
            waste companies, recyclers, and local authorities.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              href="/register"
              className="rounded-md bg-white px-6 py-3 font-semibold text-[#1b4332] hover:bg-emerald-50"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-white/40 px-6 py-3 font-semibold text-white hover:bg-white/10"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-16">
        <h2 className="text-2xl font-bold text-stone-900">How it works</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {[
            { step: "1. Request", desc: "Citizens or organizations request a pickup or report an issue with their exact location." },
            { step: "2. Collect", desc: "Waste companies assign collectors, who navigate, collect, and record proof in the field." },
            { step: "3. Track", desc: "Everyone sees real collection history, recycling impact, and environmental analytics." },
          ].map((s) => (
            <div key={s.step} className="rounded-lg border border-stone-200 bg-white p-6">
              <h3 className="font-semibold text-[#1b4332]">{s.step}</h3>
              <p className="mt-2 text-sm text-stone-600">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-emerald-50/50">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-2xl font-bold text-stone-900">Built for every role</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: "Citizens", desc: "Request pickups, report illegal dumping, track your environmental impact, and earn rewards." },
              { title: "Collectors", desc: "See your assigned jobs, navigate to pickups, and record collections — even offline in the field." },
              { title: "Waste companies", desc: "Manage collectors, vehicles, and zones, with real operational and waste analytics." },
              { title: "Organizations", desc: "Schools, hotels, and offices track their waste activity and environmental reports." },
              { title: "Recyclers", desc: "Log recycling activity by category and see real diversion-rate figures." },
              { title: "Municipal authorities", desc: "Oversee zones, complaints, and city-wide waste and environmental analytics." },
            ].map((r) => (
              <div key={r.title} className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-stone-200">
                <h3 className="font-semibold text-stone-900">{r.title}</h3>
                <p className="mt-2 text-sm text-stone-600">{r.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-5xl px-6 py-12 text-center text-sm text-stone-500">
        <p>EcoTrack — a project by Oars Technologies. Built for Uganda, designed to extend anywhere.</p>
      </footer>
    </main>
  );
}
