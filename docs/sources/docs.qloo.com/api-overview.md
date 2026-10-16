# API overview

Use the Insights API to generate taste-driven recommendations, audience insights, and analysis across supported data categories. You can use it to power recommendations, compare audience preferences, and tailor results by location.

Contents:

1.  [Insights API](#insights-api)
1.  [Key use cases](#key-use-cases)
1.  [Supporting APIs](#supporting-apis)
    1.  [Lookup APIs](#lookup-apis)
    1.  [Analysis & trends APIs](#analysis--trends-apis)
1.  [See also](#see-also)

## Insights API

The API is parameter-driven, so the entities, tags, demographics, audiences, and location values you include determine the results you get. Use these resources to design and test requests effectively:

- **[Insights API Deep Dive](insights-api-deep-dive.md)**: Test your requests live and explore how parameter combinations shape results. The Deep Dive page is especially useful when you want to experiment with parameter behavior before implementation and see example requests and responses in real-time.
- **[Parameter Overview](parameter-overview.md)**: Understand how to choose and format parameters for your request use case.
- **[Parameter Reference](parameter-reference.md)**: Full definitions of all available parameters, including descriptions, types, and details.
- **[Entity Type Parameter Guide](entity-type-parameter-guide.md)**: See which parameters are supported for each `filter.type`, including whether they are required or optional.

## Key use cases

- [Recommendation Insights](recommendation-insights.md): Get top recommendations for any entity type
- [Demographic Insights](demographic-insights.md): See how different audiences align with an entity or tag
- [Heatmaps](heatmap-insights-use-case.md): Visualize geographic affinity data
- [Location-Based Insights](location-based-insights.md): Tailor results by geography
- [Taste Analysis](taste-analysis.md): Retrieve metadata and taste-related tags

## Supporting APIs

Qloo provides additional APIs to complement Insights by helping you discover valid input values, analyze trends, and compare entities or audiences. These APIs are organized into two functional groups:

### Lookup APIs

Use these APIs to search for and validate IDs you can pass as parameters to Insights.

- [Search Entities](search-entities.md): Search for entity IDs by name
- [Search Entities by ID](search-entities-by-id.md): Search for entities by ID
- [Get Audiences](get-audiences.md): Search for audiences
- [Get Audience Types](get-audience-types.md): List available audience types
- [Search Tags](search-tags.md): Search for tags
- [Get Tag Types](get-tag-types.md): Retrieve available tag types by entity category

### Analysis & trends APIs

Use these APIs to analyze, compare, and monitor entity or audience performance over time.

- [Analysis Compare](analysis-compare.md): Analyze and compare two groups of entities.
- [Get Trending Data](get-trending-data.md): Get time-series data showing the popularity trends of a specific entity over a given time period.

## See also

- [API overview on docs.qloo.com](https://docs.qloo.com/reference/api-overview), fetched 2026-10-16, page updated 2026-03-30
- [API onboarding and authentication](api-onboarding-and-authentication.md)
- [Key use cases](key-use-cases.md)
- [API system status](api-system-status.md)
