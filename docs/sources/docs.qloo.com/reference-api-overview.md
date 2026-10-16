---
updatedAt: 2026-03-30T17:18:48.000Z
---

# API Overview

# Insights API

Use the Insights API to generate taste-driven recommendations, audience insights, and analysis across supported data categories. You can use it to power recommendations, compare audience preferences, and tailor results by location.

The API is parameter-driven, so the entities, tags, demographics, audiences, and location values you include determine the results you get. Use these resources to design and test requests effectively:

- **[Insights API Deep Dive](https://docs.qloo.com/reference/insights-api-deep-dive#/)**: Test your requests live and explore how parameter combinations shape results. The Deep Dive page is especially useful when you want to experiment with parameter behavior before implementation and see example requests and responses in real-time.
- **[Parameter Overview](https://docs.qloo.com/reference/parameter-overview#/)**: Understand how to choose and format parameters for your request use case.
- **[Parameter Reference](https://docs.qloo.com/reference/parameters#/)**: Full definitions of all available parameters, including descriptions, types, and details.
- **[Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type#/)**: See which parameters are supported for each `filter.type`, including whether they are required or optional.

# Key Use Cases

<Cards columns={4}>
  <Card title="Recommendation Insights" href="https://docs.qloo.com/reference/basic-insights-use-case" icon="fa-lightbulb" target="_blank">
    Get top recommendations for any entity type
  </Card>

  <Card title="Demographic Insights" href="https://docs.qloo.com/reference/demographics-use-case" icon="fa-users" target="_blank">
    See how different audiences align with an entity or tag
  </Card>

  <Card title="Heatmaps" href="https://docs.qloo.com/reference/heatmaps-use-case" icon="fa-map" target="_blank">
    Visualize geographic affinity data
  </Card>

  <Card title="Location-Based Insights" href="https://docs.qloo.com/reference/insights-with-location-use-case" icon="fa-location-dot" target="_blank">
    Tailor results by geography
  </Card>

  <Card title="Taste Analysis" href="https://docs.qloo.com/reference/taste-analysis" icon="fa-palette" target="_blank">
    Retrieve metadata and taste-related tags
  </Card>
</Cards>

# Supporting APIs

Qloo provides additional APIs to complement Insights by helping you discover valid input values, analyze trends, and compare entities or audiences. These APIs are organized into two functional groups:

## Lookup APIs

Use these APIs to search for and validate IDs you can pass as parameters to Insights.

- [Search Entities](https://docs.qloo.com/reference/get-search#/): Search for entity IDs by name
- [Search Entities by ID](https://docs.qloo.com/reference/get-entities#/): Search for entities by ID
- [Get Audiences](https://docs.qloo.com/reference/get-audiences-1#/): Search for audiences
- [Get Audience Types](https://docs.qloo.com/reference/get-audience-types-1#/): List available audience types
- [Search Tags ](https://docs.qloo.com/reference/get-tags-1#/): Search for tags
- [Get Tag Types](https://docs.qloo.com/reference/get-tag-types-1#/): Retrieve available tag types by entity category

# Analysis & Trends APIs

Use these APIs to analyze, compare, and monitor entity or audience performance over time.

- [Analysis Compare](https://docs.qloo.com/reference/analysis-compare-1#/): Analyze and compare two groups of entities.
- [Get Trending Data](https://docs.qloo.com/reference/get-trending): Get time-series data showing the popularity trends of a specific entity over a given time period.

<br />
