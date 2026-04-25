import { Link } from "react-router-dom";

const stats = [
  { label: "Active Fleet Visibility", value: "24/7" },
  { label: "Role-Based Workflows", value: "User / Driver / Admin" },
  { label: "Operations Modules", value: "6+" },
];

const features = [
  {
    title: "Smart Load Management",
    description:
      "Create, assign, and monitor loads with clear status updates from booking to final delivery.",
    tone: "from-blue-50 to-white",
  },
  {
    title: "Live Route Visibility",
    description:
      "Track active trips and monitor movement updates to keep dispatch and customers aligned in real time.",
    tone: "from-indigo-50 to-white",
  },
  {
    title: "Driver Verification Flow",
    description:
      "Onboard and verify drivers through structured KYC for a safer and more reliable network.",
    tone: "from-sky-50 to-white",
  },
  {
    title: "Billing And Payment Tracking",
    description:
      "Generate invoices, follow payment status, and maintain transparent transaction records across roles.",
    tone: "from-blue-50 to-white",
  },
  {
    title: "Proof Of Delivery",
    description:
      "Collect and review POD submissions so every completed shipment has clear delivery evidence.",
    tone: "from-indigo-50 to-white",
  },
  {
    title: "Operations Analytics",
    description:
      "Use performance metrics and dashboard KPIs to improve on-time delivery and fleet efficiency.",
    tone: "from-sky-50 to-white",
  },
];

const workflow = [
  {
    step: "1",
    title: "Plan",
    description:
      "Create loads, define routes, and prepare assignments with all key details in one place.",
  },
  {
    step: "2",
    title: "Move",
    description:
      "Track active operations live while drivers and dispatch stay connected through role-based dashboards.",
  },
  {
    step: "3",
    title: "Close",
    description:
      "Complete POD, billing, and payment flow with a clear record of every completed shipment.",
  },
];

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-blue-50 via-indigo-50 to-sky-100">
      <div className="pointer-events-none absolute -left-24 -top-28 h-72 w-72 rounded-full bg-blue-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-16 h-80 w-80 rounded-full bg-indigo-300/30 blur-3xl" />
      <div className="pointer-events-none absolute bottom-[-130px] left-1/3 h-72 w-72 rounded-full bg-sky-300/30 blur-3xl" />

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10">
        <header className="reveal rounded-2xl border border-white/70 bg-white/70 p-3 shadow-lg backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-white/80 px-4 py-3">
            <div className="flex items-center gap-3">
              <img src="/transmaa-icon.svg" alt="Transmaa" className="h-10 w-10" />
              <div>
                <p className="headline-font text-lg font-bold leading-tight text-blue-700">TRANSMAA</p>
                <p className="text-xs text-slate-500">Smart Transport Management</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a href="#features" className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">
                Features
              </a>
              <a href="#workflow" className="rounded-md px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-blue-50 hover:text-blue-700">
                Workflow
              </a>
              <Link
                to="/login"
                className="rounded-md border border-blue-200 bg-white px-4 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Register
              </Link>
            </div>
          </div>
        </header>

        <section className="mt-7 grid gap-6 lg:grid-cols-12">
          <div className="reveal delay-1 rounded-3xl border border-blue-100 bg-white/85 p-6 shadow-xl backdrop-blur-md md:p-8 lg:col-span-7">
            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
              Built For Logistics Teams
            </span>

            <h1 className="headline-font mt-4 text-4xl font-extrabold leading-tight text-slate-900 md:text-5xl">
              Run Smarter
              <span className="block text-blue-700">Transport Operations</span>
            </h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-600 md:text-lg">
              Transmaa connects dispatch, drivers, and customers on a single workflow
              so your operations stay visible, controlled, and efficient at every step.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/login"
                className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-blue-700"
              >
                Login To Continue
              </Link>
              <Link
                to="/register"
                className="rounded-xl border border-blue-200 bg-blue-50 px-6 py-3 text-sm font-semibold text-blue-700 transition hover:-translate-y-0.5 hover:bg-blue-100"
              >
                Create New Account
              </Link>
            </div>

            <div className="mt-7 grid gap-3 sm:grid-cols-3">
              {stats.map((stat) => (
                <article key={stat.label} className="rounded-2xl border border-blue-100 bg-white p-4">
                  <p className="headline-font text-lg font-bold text-blue-700">{stat.value}</p>
                  <p className="mt-1 text-xs text-slate-500">{stat.label}</p>
                </article>
              ))}
            </div>
          </div>

          <aside className="reveal delay-2 rounded-3xl border border-indigo-100 bg-gradient-to-b from-white to-indigo-50 p-6 shadow-xl lg:col-span-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">
              Operations Snapshot
            </p>
            <h2 className="headline-font mt-2 text-2xl font-bold text-slate-900">
              One Platform. Total Control.
            </h2>

            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-blue-100 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">Dispatch Board</p>
                <p className="mt-1 text-xs text-slate-500">Track each load status from planned to delivered.</p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">Driver Verification</p>
                <p className="mt-1 text-xs text-slate-500">Approve trusted drivers with structured onboarding checks.</p>
              </div>
              <div className="rounded-xl border border-blue-100 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700">Billing Visibility</p>
                <p className="mt-1 text-xs text-slate-500">Monitor invoice lifecycle and payment progress in real time.</p>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-indigo-200 bg-indigo-600 p-4 text-white">
              <p className="text-sm font-semibold">Transmaa Purpose</p>
              <p className="mt-1 text-sm text-indigo-100">
                Make transport operations safer, faster, and easier to manage from booking to delivery.
              </p>
            </div>
          </aside>
        </section>

        <section id="features" className="reveal delay-2 mt-10 rounded-3xl border border-blue-100 bg-white/88 p-6 shadow-lg backdrop-blur-md md:p-8">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Core Features</p>
              <h2 className="headline-font mt-2 text-3xl font-bold text-slate-900">
                Purpose-Driven Product Design
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
                Every module is built to reduce delays, improve coordination, and keep transport workflows reliable.
              </p>
            </div>
            <Link
              to="/register"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Start With Transmaa
            </Link>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <article
                key={feature.title}
                className={`group rounded-2xl border border-blue-100 bg-gradient-to-b p-5 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md ${feature.tone}`}
              >
                <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white">
                  {feature.title.charAt(0)}
                </div>
                <h3 className="headline-font text-lg font-bold text-slate-800">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{feature.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" className="reveal delay-3 mt-10 rounded-3xl border border-indigo-100 bg-gradient-to-b from-white to-indigo-50 p-6 shadow-lg md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">How It Works</p>
          <h2 className="headline-font mt-2 text-3xl font-bold text-slate-900">
            Fast Workflow From Start To Finish
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {workflow.map((item) => (
              <article key={item.step} className="relative rounded-2xl border border-indigo-100 bg-white p-5">
                <span className="headline-font inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                  {item.step}
                </span>
                <h3 className="headline-font mt-3 text-xl font-bold text-slate-800">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="reveal delay-3 mt-10 rounded-3xl border border-blue-200 bg-blue-700 p-6 shadow-xl md:p-8">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div>
              <h2 className="headline-font text-2xl font-bold text-white md:text-3xl">
                Ready To Manage Transport Better?
              </h2>
              <p className="mt-2 text-sm text-blue-100 md:text-base">
                Sign in to your workspace or create an account to start operating with Transmaa.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link
                to="/login"
                className="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="rounded-lg border border-blue-300 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-600"
              >
                Register
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
