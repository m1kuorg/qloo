# Methodology and sources

Our platform, Insights by Qloo, and our API deliver taste-based personalization without relying on personal identity data. Instead, they leverage a highly structured ontology spanning a vast set of cultural entities across domains like music, fashion, and dining. By operating exclusively on anonymized signals, our system ensures both privacy and compliance while uncovering meaningful consumer taste correlations at scale. This section explains the data foundation, processing techniques, and representative data behind Qloo’s AI-driven insights.

Contents:

1.  [In this section](#in-this-section)
1.  [Core concepts](#core-concepts)
1.  [See also](#see-also)

## In this section

- [Data Foundation](data-foundation.md): How Qloo collects and structures entity data while ensuring privacy compliance.
- [Processing Methodology](processing-methodology.md): How signals are processed, machine learning models are applied, and insights are derived.
- [Representative Data and Patterns](representative-data-and-patterns.md): Sample co-occurrence data and cross-category correlations.

## Core concepts

- **Entity**: A structured unit within Qloo’s ontology, representing a person, place, or thing (e.g., a brand, movie, musician, restaurant).
- **Signal**: A weighted data point representing consumer interactions with entities, such as purchases, streams, or reviews.
- **Metadata**: Attributes assigned to entities that enhance understanding and classification, such as genre for a movie or ambiance for a restaurant.
- **`/insights` API**: Our primary API endpoint providing personalized recommendations and entity metadata based on cultural co-occurrences.

## See also

- [Methodology and sources on docs.qloo.com](https://docs.qloo.com/docs/methodologies), fetched 2026-10-16, page updated 2026-09-18
- [Insights API](insights-api.md)
