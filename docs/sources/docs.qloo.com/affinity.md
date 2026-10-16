# Affinity

A basic overview of affinity scores and why they are useful.

Contents:

1.  [What's an affinity score?](#whats-an-affinity-score)
1.  [How it works](#how-it-works)
1.  [Why it works](#why-it-works)
1.  [Real-world applications](#real-world-applications)
1.  [See also](#see-also)

## What's an affinity score?

Affinity scores are Qloo's way of measuring how closely two things are connected, like how much a specific audience in New York City loves a particular music artist. It quantifies the strength of relationships between inputs—like demographics or geolocations—and their most relevant outputs.

Affinity scores range from 0 to +1, with +1 being a perfect match and 0 meaning no correlation. These scores are powered by a sophisticated blend of AI models, proprietary algorithms, and carefully curated data. You can use affinity scores to gain insight into audience preferences, behaviors, and relationships across different categories. The meaning and application of an affinity score can vary depending on the use case, making it a versatile tool.

> **Explore the Business Context**
>
> For a broader, business-oriented perspective on affinity scores, check out our [blog post on affinity scores](https://www.qloo.com/resources/how-qloos-affinity-score-measures-consumer-preferences). It's a great starting point for understanding the bigger picture of how affinity scores create value.

## How it works

We begin by ingesting anonymized [data signals](affinity-score-methodology.md#step-1-gathering-data-signals) that capture behaviors, preferences, and patterns. This data forms the backbone of our AI pipeline, powering models that uncover meaningful connections between entities while maintaining strict privacy standards.

Once processed, our AI analyzes these signals to identify relationships, evaluate geospatial relevance, and extract the most meaningful tags. We find correlations between entities and output an affinity score to represent how closely related these entities are. Depending on the use case, this process may instead determine an entity’s relevance to a specific location or generate descriptive tags for a collection of inputs. For a deeper look at the affinity score calculation process, see [Affinity Score Methodology](affinity-score-methodology.md).

## Why it works

The affinity score is a powerful tool for uncovering what resonates most with your audience. Combining scores, rankings, and real-world relevance helps identify meaningful connections and drive more intelligent decisions. Powered by advanced machine learning and a rich, anonymized dataset, Qloo’s approach delivers highly accurate insights adaptable to diverse business needs.

> **Still have questions?**
>
> Check out our [FAQs](faqs.md#affinity-score).

## Real-world applications

Here are some ways you might use affinity scores for your business:

1.  **Marketing Campaigns**: Tailor content to audiences by ranking entities based on relevance.

    > Example: A retailer can identify clothing brands most aligned with 30-year-old women in NYC, helping them optimize product recommendations and personalized advertising.

2.  **Geospatial Analysis**: Understand interest levels in specific locations.

    > Example: A restaurant chain discovers its brand has a higher affinity in Austin, TX, compared to other regions. They use this insight to focus expansion efforts, adjust menu offerings for local tastes, and launch hyper-local marketing campaigns.

3.  **Cross-Category Insights**: Identify relationships across different entity types.

    > Example: A query for a demographic shows affinities between a band and a travel destination, helping a travel company partner with music platforms for co-branded promotions.

4.  **Product Development**: Use affinity scores to inform product creation by understanding what resonates with target audiences.

    > Example: A tech company finds mindfulness apps resonate with fitness-focused users and prioritizes similar features in their new wearable device.

## See also

- [Affinity on docs.qloo.com](https://docs.qloo.com/docs/affinity-score), fetched 2026-10-16, page updated 2026-09-21
- [Affinity score methodology](affinity-score-methodology.md)
- [Interpreting affinity scores](interpreting-affinity-scores.md)
