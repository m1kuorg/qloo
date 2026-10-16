# Insights API

Use Qloo’s Insights API to predict what people are likely to enjoy based on taste, context, and preferences. Predictions draw on two things together: real behavioral signal, and a structured knowledge graph of entities, tags, and locations that gives that signal cultural context.

Contents:

1.  [Overview](#overview)
1.  [Key benefits](#key-benefits)
1.  [How it works](#how-it-works)
    1.  [Flexible data inputs](#flexible-data-inputs)
    1.  [Output](#output)
1.  [Lookup APIs](#lookup-apis)
1.  [Regulatory compliance](#regulatory-compliance)
1.  [See also](#see-also)

## Overview

You can use these results to personalize recommendations, target audiences, and surface relevant entities, tags, or locations. Qloo's understanding of culture and taste identifies what aligns most closely with a given group, individual, or signal.

Here’s how it works:

1.  Provide what you know about your user, audience, or scenario:
    - A movie they liked, or a musician they follow
    - Their demographics, tags, or audience segment
    - The city or neighborhood they’re in
2.  Get back a ranked list of recommendations in your chosen category (e.g., movies, localities). Results are ranked by affinity, allowing you to personalize experiences, target the right segments, and explore trends.

## Key benefits

- **Flexible Input and Output**: Seamlessly processes a wide range of data types, including entities, tags, and locations, plus supporting signals like demographic and audience composition, allowing you to input and receive highly relevant results.
- **Extensive Filtering and Customization**: With a broad range of filters and signal parameters, you can fine-tune your queries to ensure the results are precisely tailored to your needs. Whether you're focusing on specific genres, locations, or other filter criteria, the Insights API offers the flexibility you need.
- **Cultural Grounding for AI Agents**: As more discovery happens through conversational and agentic interfaces, Qloo grounds those systems in real cultural signal and a knowledge graph of entities spanning people, places, and culture, so an AI agent recommending a restaurant, a playlist, or a product reflects actual taste patterns instead of guessing from generic training data.

## How it works

### Flexible data inputs

The Insights API accepts the following data types as inputs and can return those same data types as results tailored to each use case:

- Entities: Retrieve results for artists, brands, movies, and more.
- Tags: Filter results by specific genres, cuisines, or other attributes.
- **Location**: Query location-based preferences or signals to discover geo-specific trends.

The API also accepts population-level and segment-level signals, such as age, gender, or audience composition, as supporting inputs to further refine results.

Include an entity category, such as "artist" or "locality," plus any other filter or signal criteria in your request. Explore the [API details](insights-api-deep-dive.md) to test requests, or read more about our [data ingestion and AI models](methodology-and-sources.md).

### Output

The Insights API returns:

- **Affinity Scores**: Ranging from 0 to +1, affinity scores indicate the strength of recommendations. Higher scores mean higher relevance.
- **Popularity**: Popularity scores rank entities within their category, indicating their relative signal strength.

## Lookup APIs

Use these related routes to find valid inputs and support your Insights requests:

- [Search Tags](search-tags.md)
- [Get Tag Types](get-tag-types.md)

Learn more in [API overview](api-overview.md).

## Regulatory compliance

Like all of Qloo's APIs, the Insights API is privacy-centric and compliant by design. Inferences are powered by abstracted location arrays and entity arrays, and require no personally identifiable information. Qloo's Insights route was developed to be compliant with bright-line statutory language, such as Article 6 of the General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA).

## See also

- [Insights API on docs.qloo.com](https://docs.qloo.com/docs/insights-api), fetched 2026-10-16, page updated 2026-09-21
- [Insights API deep dive](insights-api-deep-dive.md)
- [Parameter reference](parameter-reference.md)
