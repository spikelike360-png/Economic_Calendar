export function SkeletonRow() {
  return (
    <tr className="border-b border-slate-800/50">
      {[60, 70, 80, 200, 80, 80, 80].map((w, i) => (
        <td key={i} className="px-3 py-3">
          <div
            className="h-3 rounded bg-slate-700/60 animate-pulse"
            style={{ width: w }}
          />
        </td>
      ))}
    </tr>
  );
}

export function CalendarSkeleton() {
  return (
    <table className="w-full table-fixed text-sm">
      <tbody>
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </tbody>
    </table>
  );
}

export function MetricSkeleton() {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900 p-4 space-y-3 animate-pulse">
      <div className="h-4 w-32 rounded bg-slate-700/60" />
      <div className="grid grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-20 rounded bg-slate-700/60" />
            <div className="h-5 w-16 rounded bg-slate-700/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
