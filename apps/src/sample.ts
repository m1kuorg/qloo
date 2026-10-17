// The sample network a new session opens on: The Ringer's public show names with figures Crossfeed
// chose (TRD demo data). Each figure stays labelled as an arbitrary sample figure until the visitor
// changes it.
import type { LaunchInput } from './agent'
import type { RosterRow } from './roster'
import file from './sample-network.json'

// A show's figure that still holds the sample network's value.
export type SampleFigure = 'downloads' | 'status' | 'description'

export type Sample = {
  network: string
  notice: string // says the figures are arbitrary and that Crossfeed isn't affiliated with the network
  launch: LaunchInput // prefilled for the visitor to start, never started for them
  // Suggested for the run's questions, for the guide, the replay, and the warm-up; never filled in.
  answers: { budget: { slots: number }; exclusions: string[] }
  cpm: boolean // whether the session's CPM is still the sample's
}

export const sampleRoster: (RosterRow & { sample: SampleFigure[] })[] = file.shows.map((show) => {
  const fields = { downloads: show.downloadsPerEpisode, status: show.status, description: show.description }
  return {
    name: show.name,
    downloads: fields.downloads.value,
    status: fields.status.value,
    description: fields.description.value,
    sample: (Object.keys(fields) as SampleFigure[]).filter((k) => fields[k].sample)
  }
})

export const sampleCpm = file.cpm.value

export const sample: Sample = {
  network: file.network,
  notice: file.notice,
  launch: file.launch,
  answers: file.answers,
  cpm: file.cpm.sample
}
