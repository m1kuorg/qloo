---
updatedAt: 2026-03-30T17:19:54.000Z
---

# Signal

Signals are consumer interactions with <Glossary>entities</Glossary>. They carry a specific weight, indicating the magnitude of the interaction. For example, a signal could be a user liking a post on social media. Signals can include interactions like transactions, reviews (positive or negative), likes, streams, comments, posts, and list inclusions. These weighted signals help to quantify and qualify user preferences and behaviors.

<Image align="center" alt="Diagram showing how a user interacts with an entity creating a signal" caption="Diagram showing how a user interacts with an entity, creating a signal" src="https://files.readme.io/2c3d922-image.png" width="500px" />

# Signal Arrays

A signal array is a collection of signals. Signals represent interactions associated with an entity, and a signal array acts as a bucket containing multiple signals. It can be used to represent taste and serve as an input when making a request to the [Insights API](https://docs.qloo.com/docs/insights-api). The provided preferences in the signal array influence the results of the request.

For example, a signal array might show an anonymous user reviewed Stranger Things, posted an image at Shake Shack, liked Beyoncé, and bought a hat at Supreme. This array consists of weighted signals associated with these entities, enabling us to learn and produce recommendations for this collection.

<br />

<Image align="center" alt="Diagram showing how a user interacts with multiple entities creating a signal array" caption="Diagram showing how a user interacts with multiple entities, creating a signal array" src="https://files.readme.io/e4e3d55-image.png" width="500px" />

# Geospatial Signal Associations

A signal is linked to a geospatial location when a consumer interaction occurs at a specific place, such as tagging a location in a social media post or making a purchase at a venue. Repeated interactions with the same location increase its weighting, reinforcing its significance in determining user preferences.

When a signal array contains multiple locations, each location becomes an associated point in the array. If a signal is expressed toward Entity E1 at Location L1 and Entity E2 at Location L2, then Entity E3—sharing an array with E1 and E2—also inherits associations with L1 and L2. This enables multi-location inference, where entities connected through shared interactions gain spatial relevance.

For broader geographic areas, such as cities or neighborhoods, associations are determined by signal density rather than specific points. Locations are structured using geohashes, which encode geographic coordinates into hierarchical regions, optimizing location-based insights.

<Image align="center" width="500px" src="https://files.readme.io/77ec5ff65a53983824c01a06dbefa1e5cf89215705542bc6a634c9b776cdc73e-Screenshot_2025-03-14_at_2.51.53_PM.png" />

# Signal Validation

The signal validation process includes bot-detection mechanisms that assess interaction patterns to distinguish meaningful engagement from automated activity. This involves applying thresholds and anomaly detection techniques to identify and filter out bot-generated signals. Our bot detection framework is continuously refined to ensure that signal arrays accurately reflect genuine user preferences and taste.

<Image align="center" width="500px" src="https://files.readme.io/b24304f0cfb4716bbc5a701949cff22971455cc5921150bab51d9745d37f90ea-Screenshot_2025-03-14_at_2.27.22_PM.png" />
