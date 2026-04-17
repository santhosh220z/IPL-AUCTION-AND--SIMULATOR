export default function Panel({ title, subtitle, rightSlot, children, className = "" }) {
  return (
    <section className={`glass rounded-2xl p-5 shadow-ambient ${className}`}>
      {(title || subtitle || rightSlot) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-display text-xl font-bold text-storm-900">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-storm-700">{subtitle}</p>}
          </div>
          {rightSlot}
        </div>
      )}
      {children}
    </section>
  );
}
