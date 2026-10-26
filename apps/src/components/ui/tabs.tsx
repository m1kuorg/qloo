// Forked from shadcn's base-nova tabs: the list and its tabs are the segmented control in ./variants.ts
// (a tone-step track, the active tab raised onto the card), with no line variant and no indicator,
// whose positioning script the island has no use for. Don't restore them with
// `shadcn add tabs --overwrite`; edit ./variants.ts.
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cn } from 'cn'
import { segmentedItemVariants, segmentedTrackVariants } from './variants'

function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn('flex gap-3 data-horizontal:flex-col', className)}
      orientation={orientation}
      {...props}
    />
  )
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return <TabsPrimitive.List data-slot="tabs-list" className={cn(segmentedTrackVariants(), className)} {...props} />
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return <TabsPrimitive.Tab data-slot="tabs-trigger" className={cn(segmentedItemVariants(), className)} {...props} />
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return <TabsPrimitive.Panel data-slot="tabs-content" className={cn('min-w-0 flex-1', className)} {...props} />
}

export { Tabs, TabsContent, TabsList, TabsTrigger }
