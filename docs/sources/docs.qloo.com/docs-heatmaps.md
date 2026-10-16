---
updatedAt: 2026-09-21T17:11:48.000Z
---

# Heatmap Insights

<br />

You can use the Insights API to create interactive heatmaps that visually depict the concentration or dispersion of <Glossary>signal</Glossary> for an <Glossary>entity</Glossary> across various geographical locations. Heatmaps offer an intuitive way to explore and understand the geographic distribution of signals, uncovering insights and patterns in consumer preferences across different areas.

# Key Features and Benefits

Qloo's heatmaps give you a clear read on geolocational data:

- **Visualize Entity Presence**: Access a visual representation of the <Glossary>signal</Glossary> for a specific <Glossary>entity</Glossary> in a given area. This enables you to identify areas with a strong presence or preference for the entity.
- **Identify Hotspots and Trends**: Easily identify hotspots where the entity's <Glossary>affinity score</Glossary> and affinity rank are highly concentrated and discover emerging trends or patterns across different geographical locations.
- **Make Informed Decisions**: Use heatmap data to inform decisions about marketing strategies, location-based targeting, and understanding user preferences in specific areas.

# How It Works

Heatmaps create a visual representation of a few key metrics. These metrics include an entity's <Glossary>affinity score</Glossary>, affinity rank, and <Glossary>popularity</Glossary> within specific <Glossary>geohashes</Glossary>. By leveraging these pre-calculated scores, the heatmap offers valuable insights into an entity's relative strength and popularity in various geographic areas. You can use this data to visualize the concentration or dispersion of interest for the entity across different locations. Each point in the heatmap is assigned three scores, providing a comprehensive understanding of the entity's presence within the selected location:

### Affinity Score

This compares an entity to other entities within a geographic location, both locally and globally. The affinity score provides a normalized measure of how much interest people in a specific location have in an entity, compared to other entities with signals in that area. This helps assess the relative level of interest across different locations from both a local and broader perspective.

### Popularity Score

This percentile score reflects the entity's popularity within the geohash, indicating its signal density relative to other entities in the same location.

### Affinity Rank in Geospatial Context

This measures how well an entity, such as a brand or product, performs relative to itself across locations in the area of interest. Affinity rank helps identify where that entity overperforms or underperforms geographically, making it useful for comparing the entity’s relative strength from one location to another.

## Interpretation

By combining these scores, the heatmap uses warmer colors to indicate higher signal concentrations, while cooler colors represent lower concentrations, signifying a more dispersed or less significant presence of the entity.
