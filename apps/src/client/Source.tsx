import { Badge } from '@/components/ui/badge'

// Labels where a figure or line came from, wherever it appears. The two never read alike: Qloo data
// is an outlined chip with an ink square, agent text a tone-filled chip with a circle.
export function Source({ of }: { of: 'qloo' | 'agent' }) {
  return of === 'qloo' ? (
    <Badge variant="outline" mark="square">
      Qloo data
    </Badge>
  ) : (
    <Badge mark="circle">Agent</Badge>
  )
}
