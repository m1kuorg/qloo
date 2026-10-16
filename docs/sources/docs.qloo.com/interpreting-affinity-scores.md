# Interpreting affinity scores

A guide to interpreting affinity scores: use cases, score ranges, and how query narrowing impacts results.

Contents:

1.  [Overview](#overview)
1.  [Use cases](#use-cases)
1.  [Affinity score ranges](#affinity-score-ranges)
1.  [Understanding score behavior](#understanding-score-behavior)
    1.  [When results score similarly](#when-results-score-similarly)
    1.  [Interpreting small differences](#interpreting-small-differences)
    1.  [Score vs. index](#score-vs-index)
    1.  [Applying scores to brand and campaign decisions](#applying-scores-to-brand-and-campaign-decisions)
1.  [See also](#see-also)

## Overview

Affinity scores provide a quantitative measure of the strength of relationships between inputs (such as entities, locations, or preferences) and their most relevant outputs. They adapt to various contexts like entity recommendations, geospatial insights, or taste analysis. They range from 0 to +1:

- **0** indicates no correlation.
- **+1** represents a perfect match.

## Use cases

The interpretation of an affinity score varies depending on the context:

- **Basic Insights**: Measures how similar one entity is to another. A high score means the two entities are highly similar (determined by the cosine similarity of their embeddings).

  > Example: Exploring how similar two music artists are based on the preferences and behaviors of their shared audience.

- **Location Insights**: Evaluates the significance of an entity in a specific location compared to other entities in that location. A high score indicates that an entity is particularly relevant to a specific location compared to others in that region and globally.

  > Example: Understanding how well a restaurant appeals to diners in one neighborhood versus another.

- **Taste Analysis**: Breaks down a list of entities (called a "taste vector") into descriptive tags that capture key characteristics or themes. The score represents the relevance of tags to a taste vector, with higher scores indicating stronger correlation.

  > Example: A list of movies might generate tags like "action-packed," "award-winning," or "family-friendly," capturing key characteristics of the preferences of users who favor the input movies.

> **Still have questions?**
>
> Check out our [FAQs](faqs.md#affinity-score).

## Affinity score ranges

To help interpret the significance of an affinity score, we categorize the ranges as follows:

| Affinity Score Range | Relevance | Example                                                           |
| -------------------- | --------- | ----------------------------------------------------------------- |
| > 0.8                | Very High | Chappell Roan and Sabrina Carpenter for a music artist query.     |
| 0.6 – 0.8            | High      | A local bakery and Dunkin' Donuts for a places query.             |
| = 0.5                | Medium    | A sushi restaurant and a library for a places query.              |
| < 0.5                | Low       | Chappell Roan and a historical landmark for a music artist query. |

> Affinity scores may decrease as more inputs or filters are applied. For example, a score of 0.55 could still represent a strong recommendation, but including demographic data may lower the final score. Consider the context and input complexity when evaluating scores.

## Understanding score behavior

### When results score similarly

It’s common to see multiple results with High or Very High affinity scores, especially when the input is broad or strongly defined. This typically indicates that the system has identified a cluster of strong matches, each highly relevant to the input criteria. These are often the top-ranked entities out of thousands of possibilities, and all may be viable depending on your use case.

### Interpreting small differences

Affinity scores should be interpreted in context. A slight difference, like 0.91 versus 0.92, usually indicates similar relevance. Larger gaps indicate more pronounced differences in the strength of entity connections. In most cases, minor score differences reflect similar relevance and are best evaluated alongside the order in which results appear.

### Score vs. index

The affinity score measures the strength of relationships between entities, such as audiences, interests, or locations. When you submit a query, the index provides a quick and meaningful way to assess relevance by ranking results based on their affinity scores.

For example, in response to the query, “What are the most popular music artists for people living in NYC?”, artists are assigned an index based on their scores. Even if two artists have similar scores, like 0.92 and 0.91, the index reflects their relative position in the results. A lower index means higher relevance.

### Applying scores to brand and campaign decisions

Affinity scores can help identify brand partners or collaborators that best align with your target audience’s tastes and values.

- Focus on the top-ranked results, especially those labeled as High or Very High affinity.
- Use filters to reflect your campaign’s intended audience segment, such as demographics, interests, or location.
- Because scores are normalized per query, compare brands based on their relative position in the results, not just the raw score.
- Use tags to evaluate shared traits, such as sustainability, regional popularity, or lifestyle themes.

When several brands rank highly, prioritize based on audience fit and strategic alignment, rather than focusing on slight differences in scores.

## See also

- [Interpreting affinity scores on docs.qloo.com](https://docs.qloo.com/docs/interpreting-affinity-scores), fetched 2026-10-16, page updated 2026-09-25
- [Affinity](affinity.md)
- [FAQs](faqs.md)
