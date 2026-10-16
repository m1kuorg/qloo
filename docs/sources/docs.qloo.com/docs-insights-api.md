---
updatedAt: 2026-09-21T17:24:05.000Z
---

# Insights API

Use Qloo’s Insights API to predict what people are likely to enjoy based on taste, context, and preferences. Predictions draw on two things together: real behavioral signal, and a structured knowledge graph of entities, tags, and locations that gives that signal cultural context. You can use these results to personalize recommendations, target audiences, and surface relevant entities, tags, or locations. Qloo's understanding of culture and taste identifies what aligns most closely with a given group, individual, or signal.

Here’s how it works:

1. Provide what you know about your user, audience, or scenario:
   - A movie they liked, or a musician they follow
   - Their demographics, tags, or audience segment
   - The city or neighborhood they’re in
2. Get back a ranked list of recommendations in your chosen category (e.g., movies, localities).Results are ranked by <Glossary>affinity</Glossary>, allowing you to personalize experiences, target the right segments, and explore trends.

# Key Benefits

- **Flexible Input and Output**: Seamlessly processes a wide range of data types, including entities, tags, and locations, plus supporting signals like demographic and audience composition, allowing you to input and receive highly relevant results.
- **Extensive Filtering and Customization**: With a broad range of filters and signal parameters, you can fine-tune your queries to ensure the results are precisely tailored to your needs. Whether you're focusing on specific genres, locations, or other filter criteria, the Insights API offers the flexibility you need.
- **Cultural Grounding for AI Agents**: As more discovery happens through conversational and agentic interfaces, Qloo grounds those systems in real cultural signal and a knowledge graph of entities spanning people, places, and culture, so an AI agent recommending a restaurant, a playlist, or a product reflects actual taste patterns instead of guessing from generic training data.How It Works

## Flexible Data Inputs

The Insights API accepts the following data types as inputs and can return those same data types as results tailored to each use case:

- <Glossary>Entities</Glossary>: Retrieve results for artists, brands, movies, and more.
- <Glossary>Tags</Glossary>: Filter results by specific genres, cuisines, or other attributes.
- **Location**: Query location-based preferences or signals to discover geo-specific trends.

The API also accepts population-level and segment-level signals, such as age, gender, or audience composition, as supporting inputs to further refine results.

Include an entity category, such as "artist" or "locality," plus any other filter or signal criteria in your request. Explore the [API details](https://docs.qloo.com/reference/insights-api-deep-dive) to test requests, or read more about our [data ingestion and AI models](https://docs.qloo.com/docs/methodologies).

## Output

The Insights API returns:

- **Affinity Scores**: Ranging from 0 to +1, affinity scores indicate the strength of recommendations. Higher scores mean higher relevance.
- **Popularity**: Popularity scores rank entities within their category, indicating their relative signal strength.

# Lookup APIs

Use these related routes to find valid inputs and support your Insights requests:

- [Search Tags](https://docs.qloo.com/reference/get-tags)
- [Get Tag Types](https://docs.qloo.com/reference/get-tag-types)

[Learn more.](https://docs.qloo.com/reference/api-overview#supporting-apis)

# Regulatory Compliance

Like all of Qloo's APIs, the Insights API is privacy-centric and compliant by design. Inferences are powered by abstracted location arrays and entity arrays, and require no personally identifiable information. Qloo's Insights route was developed to be compliant with bright-line statutory language, such as Article 6 of the General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA).
