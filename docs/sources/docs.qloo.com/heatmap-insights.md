# Heatmap insights

You can use the Insights API to create interactive heatmaps that visually depict the concentration or dispersion of signal for an entity across various geographical locations. Heatmaps offer an intuitive way to explore and understand the geographic distribution of signals, uncovering insights and patterns in consumer preferences across different areas.

Contents:

1.  [Key features and benefits](#key-features-and-benefits)
1.  [How it works](#how-it-works)
    1.  [Affinity score](#affinity-score)
    1.  [Popularity score](#popularity-score)
    1.  [Affinity rank in geospatial context](#affinity-rank-in-geospatial-context)
    1.  [Interpretation](#interpretation)
1.  [See also](#see-also)

## Key features and benefits

Qloo's heatmaps give you a clear read on geolocational data:

- **Visualize Entity Presence**: Access a visual representation of the signal for a specific entity in a given area. This enables you to identify areas with a strong presence or preference for the entity.
- **Identify Hotspots and Trends**: Easily identify hotspots where the entity's affinity score and affinity rank are highly concentrated and discover emerging trends or patterns across different geographical locations.
- **Make Informed Decisions**: Use heatmap data to inform decisions about marketing strategies, location-based targeting, and understanding user preferences in specific areas.

## How it works

Heatmaps create a visual representation of a few key metrics. These metrics include an entity's affinity score, affinity rank, and popularity within specific geohashes. By leveraging these pre-calculated scores, the heatmap offers valuable insights into an entity's relative strength and popularity in various geographic areas. You can use this data to visualize the concentration or dispersion of interest for the entity across different locations. Each point in the heatmap is assigned three scores, providing a comprehensive understanding of the entity's presence within the selected location:

### Affinity score

This compares an entity to other entities within a geographic location, both locally and globally. The affinity score provides a normalized measure of how much interest people in a specific location have in an entity, compared to other entities with signals in that area. This helps assess the relative level of interest across different locations from both a local and broader perspective.

### Popularity score

This percentile score reflects the entity's popularity within the geohash, indicating its signal density relative to other entities in the same location.

### Affinity rank in geospatial context

This measures how well an entity, such as a brand or product, performs relative to itself across locations in the area of interest. Affinity rank helps identify where that entity overperforms or underperforms geographically, making it useful for comparing the entity’s relative strength from one location to another.

### Interpretation

By combining these scores, the heatmap uses warmer colors to indicate higher signal concentrations, while cooler colors represent lower concentrations, signifying a more dispersed or less significant presence of the entity.

## See also

- [Heatmap insights on docs.qloo.com](https://docs.qloo.com/docs/heatmaps), fetched 2026-10-16, page updated 2026-09-21
- [Heatmap insights use case](heatmap-insights-use-case.md)
- [Location insights](location-insights.md)
