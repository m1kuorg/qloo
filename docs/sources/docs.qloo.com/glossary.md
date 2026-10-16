# Glossary

Definitions of terms used across the Qloo developer documentation.

Contents:

1.  [Affinity score](#affinity-score)
1.  [Audiences](#audiences)
1.  [Bias](#bias)
1.  [Cultural intelligence](#cultural-intelligence)
1.  [Disambiguation](#disambiguation)
1.  [Entity](#entity)
1.  [Entity types](#entity-types)
1.  [Filter](#filter)
1.  [Fuzzy](#fuzzy)
1.  [Geo boundary](#geo-boundary)
1.  [Geohash](#geohash)
1.  [Geo point](#geo-point)
1.  [Heatmap](#heatmap)
1.  [Inference](#inference)
1.  [Insight](#insight)
1.  [Interest](#interest)
1.  [Knowledge graph](#knowledge-graph)
1.  [ML](#ml)
1.  [Popularity](#popularity)
1.  [Signals](#signals)
1.  [Signal array](#signal-array)
1.  [Tags](#tags)
1.  [Taste](#taste)
1.  [Trending](#trending)
    1.  [Trending (popularity)](#trending-popularity)
    1.  [Trending (trajectory)](#trending-trajectory)
1.  [See also](#see-also)

## Affinity score

A metric that measures the similarity between a reference entity and recommended entities, ranging from 0 to +1. Higher scores indicate greater relevance. Learn more in [Affinity](affinity.md).

## Audiences

Audiences are collections of valid signals accumulated through client interactions with our API. Learn more in [Audiences](audiences.md).

## Bias

A category of parameters that can be used to skew the bias of the query results in favor of a particular attribute (i.e. gender, age).

## Cultural intelligence

Cultural intelligence refers to the ability to understand and predict relationships between people's tastes, preferences, and cultural affinities across categories and domains. It is the core framing for Qloo's platform, distinguishing its approach from demographic- or behavior-based personalization.

## Disambiguation

In AI, this refers to the techniques used to determine the most probable meaning of a phrase.

## Entity

Entities represent notable people, places, things, and interests. Each entity represents a node that Qloo recognizes and has built inferential intelligence around. Learn more in [Entities](entities.md).

## Entity types

Categories that an entity is categorized into (i.e. books, movies, music). Find the full list of types in [Entities](entities.md).

## Filter

Filters are used to narrow down results by specifying attributes like sub-genres or price levels. They ensure outputs match the desired criteria and work inclusively by default. Learn more in [Filters](filters.md).

## Fuzzy

This refers to methods that allow for approximate matching or searching, rather than requiring exact matches. This means the system can handle and return results that are close or similar to the input, even if there are slight errors, variations, or ambiguities.

## Geo boundary

A defined border or perimeter that delineates a specific geographic area.

## Geohash

A geohash encodes coordinates into a tile that represents a geographic location. Learn more in [Geohash tiles](location-insights.md#geohash-tiles).

## Geo point

A geo point is represented by a latitude/longitude pair and radius.

## Heatmap

A visual representation of the concentration or dispersion of signal for an entity across various geographical locations. Learn more in [Heatmap insights](heatmap-insights.md).

## Inference

The process of running live data through a trained machine learning model to make a prediction or solve a task.

## Insight

In the Qloo ecosystem, an insight is a data-driven finding that uncovers patterns, preferences, or correlations in cultural and consumer domains, helping users understand and predict audience behavior.

## Interest

Interests refer to unique people, places, things, and attributes. They include both Qloo entities and tags.

## Knowledge graph

Qloo's knowledge graph is the structural network connecting a vast set of entities, people, places, things, and interests, through relationships built from real-world signals and metadata. It is the foundational layer underlying every affinity score, recommendation, and insight Qloo produces.

## ML

Machine Learning

## Popularity

A percentile value that represents an entity's rank in terms of its signal, compared to all other entities within the same domain

## Signals

Signals are weighted interactions with entities. The weight of a signal describes the magnitude and direction of the interaction, it can describe a positive (like) or negative (dislike) interaction. Learn more in [Signal](signal.md).

## Signal array

A collection of signals indicating associated interaction. Learn more in [Signal](signal.md).

## Tags

Tags are a type of entity that serve as labels, categorizing and enriching other entities to make them easier to search and filter.

## Taste

Taste refers to the preferences, interests, and affinities of individuals or audiences across various cultural domains. It encompasses their inclinations, likes, dislikes, and the patterns of their consumption or engagement within different areas of culture.

## Trending

Trending describes how popular something is, but the term has two distinct meanings depending on context:

### Trending (popularity)

Something that is currently popular, receiving a high volume of attention, engagement, or search interest at this moment in time. Example: "What's trending on social media today?"

### Trending (trajectory)

The directional movement of popularity over a period of time. This shows whether interest in something is growing, declining, or staying flat, regardless of its current overall popularity level. Example: "This creator is trending higher" means their popularity is growing, even if they aren't widely popular yet.

## See also

- [Glossary on docs.qloo.com](https://docs.qloo.com/docs/glossary), fetched 2026-10-16, page updated 2026-09-21
- [FAQs](faqs.md)
