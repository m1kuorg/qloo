// Labels where a figure or line came from, wherever it appears: Qloo data is set in a solid chip,
// agent text in a dashed one, so the two never read alike (DESIGN.md do's).
export function Source({ of }: { of: 'qloo' | 'agent' }) {
  return <span className={`chip src-${of}`}>{of === 'qloo' ? 'Qloo data' : 'Agent'}</span>
}
