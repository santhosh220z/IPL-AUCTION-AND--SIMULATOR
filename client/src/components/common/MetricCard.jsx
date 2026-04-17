export default function MetricCard({ label, value, accent = "storm" }) {
  const accentClass =
    accent === "ember"
      ? "bg-ember-100 text-ember-600 border-ember-300"
      : "bg-storm-100 text-storm-700 border-storm-300";

  return (
    <div className={`rounded-xl border p-4 ${accentClass}`}>
      <p className="text-xs font-semibold uppercase tracking-wide">{label}</p>
      <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
    </div>
  );
}
