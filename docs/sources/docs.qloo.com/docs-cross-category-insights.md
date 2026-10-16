---
updatedAt: 2026-09-15T16:35:41.000Z
---

# Cross-Category Insights

How Qloo predicts affinities between entities in different categories, and why it matters for building culturally relevant recommendations.

Qloo's cultural intelligence platform doesn't just know that people who like one restaurant tend to like another restaurant. It can tell you that fans of a particular musician tend to gravitate toward a particular hotel brand, or that a TV show's audience skews toward a specific style of fashion. This is the job of Qloo's cross-category modeling.

## Core Concepts

- **Cross-Category Insight**: An affinity Qloo surfaces between entities in two different categories, for example a brand and a restaurant, or a music artist and a travel destination.
- **Shared Embedding Space**: A single vector space where every entity category is represented together, enabling correlations to be found across categories rather than only within one.

## What Cross-Category Means

Qloo's knowledge graph spans many entity categories: places, brands, music, film and TV, fashion, and more. Most affinity signals are strongest _within_ a single category, for example one restaurant to another. Cross-category insights are built specifically to surface affinities _across_ categories, for example a brand to a restaurant, or a music artist to a travel destination.

To do this, Qloo trains all entity categories into a single shared embedding space, rather than a separate model per category. That shared space is what lets the [Insights API](https://docs.qloo.com) surface culturally coherent connections across the full catalog, not just within one category.

## Why It Matters

Cross-category insights are what make it possible to answer questions like:

- Which hotel brands does this artist's audience also respond to?
- What fashion labels correlate with fans of this TV show?
- Given an audience defined by dining preferences, what travel destinations do they lean toward?

These are the kinds of questions a single-category recommendation system can't answer, because it never learns a relationship across categories in the first place. Cross-category output from Qloo is what powers use cases like audience targeting across categories, campaign planning across brand partners in different verticals, and enriching a customer profile built in one category with predictions in another.

## How It Fits Into the API

Cross-category affinities are one of the signal types available through the [Insights API](https://docs.qloo.com). The result is a single set of embeddings that can be queried the same way regardless of which two categories are being connected, so a customer building on the Insights API doesn't need to know or care that a brand-to-destination query is handled differently under the hood than a restaurant-to-restaurant one.

For the technical detail on how these correlations are modeled (neural networks, content-based modeling, demographic segmentation), see [Cross-Category Correlations](https://docs.qloo.com/docs/processing-methodology#cross-category-correlations) in Processing Methodology.
