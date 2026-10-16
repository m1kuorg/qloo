---
updatedAt: 2026-09-18T16:12:45.000Z
---

# Data Foundation

How Qloo collects and structures entity data while ensuring privacy compliance.

Our Insights endpoint is powered by diverse data sources and learning rights accumulated over years of API usage, leveraging billions of entity co-occurrences related to consumer taste.

These data sources include first-party data and anonymized second- and third-party interactions within Qloo’s API ecosystem. They capture sentiment derived from implicit actions (e.g., transactions, streams, views) and explicitly declared preferences (e.g., ratings, follows).

# Core Concepts

- **Anonymized Signals**: Aggregated and de-identified data points derived from interactions like transactions, content engagement (e.g., follows, streams, ratings), and location-based signals, used to model taste patterns while maintaining privacy.
- **Privacy-Centric Data Processing**: Qloo operates on pre-anonymized data, ensuring GDPR compliance by focusing on cultural entities rather than personal identities. No personally identifiable information (PII) is processed or stored.
- **Entity Coverage**: The categories Qloo analyzes, spanning half a billion+ fully deduplicated entities across consumer and entertainment industries, structured within a hierarchical ontology.
- **Metadata Structuring & Entity Classification**: Entity metadata is normalized and classified using hierarchical categories, enabling structured tags and relationships that improve recommendation precision.
- **Continuous Data Ingestion**: Real-time updates ensure adaptability to domain-specific changes, including ongoing entity classification, sentiment analysis, and metadata structuring.

# Privacy-Centricity

Qloo operates in a fully pre-anonymized fashion, making it GDPR-compliant by design as a data processor under Article 6. Indeed. In short, Qloo’s AI is powered by an understanding of cultural entities rather than personal identities. No PII is transferred to Qloo, nor are any anonymized cross-client identifiers, such as cookies, used.

# Entity Coverage

The entity graphic below illustrates the breadth of categories and individual entities Qloo can analyze and generate inferences on using its unified /insights endpoint. Qloo’s entity coverage spans over half a billion fully de-duplicated entities, organized within a comprehensive hierarchical ontology.

## Metadata & Entity Relationships

Qloo structures comprehensive metadata for every entity, using over three dozen premier big-data sources that power Layer-1 entity attribute data. These include commercial partnerships, open-source processing of Wikipedia and Wikidata, leading third-party datasets, and Qloo’s proprietary databases. This enables us to pinpoint the essence of every cultural entity, whether it’s a person, place, or thing.

For example, Qloo has mapped:

- Restaurants worldwide, including menu items, price levels, ambiance tags, notable executive chefs, and more.
- Books, capturing details such as settings, characters, genres, sub-genres, and attributes, down to the weight of a hardcover edition.
- Cross-category affinities in music, film, TV, fashion, nightlife, hospitality, and consumer brands, enabling a granular approach to recommendations.

By structuring data at this granular level, we offer unparalleled filtering capabilities, enabling our machine-learning algorithms to surface meaningful, statistically significant correlations.

# API-Driven Data Learning

## Learning from API Signals and Co-Occurrences

Qloo learns from anonymized signal velocities and entity co-occurrences within our proprietary API ecosystem. This includes:

- Contractual learning rights for requests made through Qloo’s API
- The TasteDive API ecosystem, a platform for entertainment recommendations, acquired by Qloo
- First-party sentiment capture

This structured learning pipeline allows us to continuously refine and expand our knowledge base, adapting to evolving consumer preferences and industry trends in real time.

[Cross-Category Transaction Examples](https://docs.qloo.com/docs/representative-data-and-patterns#cross-category-transaction-examples) illustrates how sample co-occurrence arrays enter Qloo’s learning pipeline.
