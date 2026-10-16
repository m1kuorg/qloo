# Signal

Signals are consumer interactions with entities. They carry a specific weight, indicating the magnitude of the interaction. For example, a signal could be a user liking a post on social media.

Contents:

1.  [Overview](#overview)
1.  [Signal arrays](#signal-arrays)
1.  [Geospatial signal associations](#geospatial-signal-associations)
1.  [Signal validation](#signal-validation)
1.  [See also](#see-also)

## Overview

Signals can include interactions like transactions, reviews (positive or negative), likes, streams, comments, posts, and list inclusions. These weighted signals help to quantify and qualify user preferences and behaviors.

## Signal arrays

A signal array is a collection of signals. Signals represent interactions associated with an entity, and a signal array acts as a bucket containing multiple signals. It can be used to represent taste and serve as an input when making a request to the [Insights API](insights-api.md). The provided preferences in the signal array influence the results of the request.

For example, a signal array might show an anonymous user reviewed Stranger Things, posted an image at Shake Shack, liked Beyoncé, and bought a hat at Supreme. This array consists of weighted signals associated with these entities, enabling us to learn and produce recommendations for this collection.

## Geospatial signal associations

A signal is linked to a geospatial location when a consumer interaction occurs at a specific place, such as tagging a location in a social media post or making a purchase at a venue. Repeated interactions with the same location increase its weighting, reinforcing its significance in determining user preferences.

When a signal array contains multiple locations, each location becomes an associated point in the array. If a signal is expressed toward Entity E1 at Location L1 and Entity E2 at Location L2, then Entity E3—sharing an array with E1 and E2—also inherits associations with L1 and L2. This enables multi-location inference, where entities connected through shared interactions gain spatial relevance.

For broader geographic areas, such as cities or neighborhoods, associations are determined by signal density rather than specific points. Locations are structured using geohashes, which encode geographic coordinates into hierarchical regions, optimizing location-based insights.

## Signal validation

The signal validation process includes bot-detection mechanisms that assess interaction patterns to distinguish meaningful engagement from automated activity. This involves applying thresholds and anomaly detection techniques to identify and filter out bot-generated signals. Our bot detection framework is continuously refined to ensure that signal arrays accurately reflect genuine user preferences and taste.

## See also

- [Signal on docs.qloo.com](https://docs.qloo.com/docs/signals), fetched 2026-10-16, page updated 2026-03-30
- [Audiences methodology](audiences-methodology.md)
- [Glossary](glossary.md)
