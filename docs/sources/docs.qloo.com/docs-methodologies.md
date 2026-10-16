---
updatedAt: 2026-09-18T16:33:55.000Z
---

# Methodology and Sources

Our platform, Insights by Qloo, and our API deliver taste-based personalization without relying on personal identity data. Instead, they leverage a highly structured ontology spanning a vast set of cultural entities across domains like music, fashion, and dining. By operating exclusively on anonymized signals, our system ensures both privacy and compliance while uncovering meaningful consumer taste correlations at scale. This section explains the data foundation, processing techniques, and representative data behind Qloo’s AI-driven insights.

# In this section

- [Data Foundation](https://docs.qloo.com/docs/data-foundation): How Qloo collects and structures entity data while ensuring privacy compliance.
- [Processing Methodology](https://docs.qloo.com/docs/processing-methodology): How signals are processed, machine learning models are applied, and insights are derived.
- [Representative Data and Patterns](https://docs.qloo.com/docs/representative-data-and-patterns): Sample co-occurrence data and cross-category correlations.

# Core Concepts

- **Entity**: A structured unit within Qloo’s ontology, representing a person, place, or thing (e.g., a brand, movie, musician, restaurant).
- **Signal**: A weighted data point representing consumer interactions with entities, such as purchases, streams, or reviews.
- **Metadata**: Attributes assigned to entities that enhance understanding and classification, such as genre for a movie or ambiance for a restaurant.
- `/insights`**API** : Our primary API endpoint providing personalized recommendations and entity metadata based on cultural co-occurrences.
