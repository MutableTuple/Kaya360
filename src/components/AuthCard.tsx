export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center text-white">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white text-xl font-bold text-navy-900">K</div>
          <div className="text-lg font-semibold tracking-tight">KAYA PROJECT INTELLIGENCE 360</div>
          <div className="text-xs text-navy-200">Kaya Interiors Private Limited</div>
        </div>
        <div className="card p-6"><h1 className="text-base font-semibold text-navy-900">{title}</h1>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}<div className="mt-4">{children}</div></div>
      </div>
    </div>
  );
}
