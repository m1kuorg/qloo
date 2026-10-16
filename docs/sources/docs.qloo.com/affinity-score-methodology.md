# Affinity score methodology

Learn about the data and process behind calculating an affinity score.

Contents:

1.  [Step 1: Gathering data signals](#step-1-gathering-data-signals)
1.  [Step 2: AI modeling](#step-2-ai-modeling)
1.  [Step 3: Calculating the affinity score](#step-3-calculating-the-affinity-score)
1.  [See also](#see-also)

## Step 1: Gathering data signals

We start by ingesting a variety of anonymized data signals that reflect behaviors, preferences, and patterns. These include:

- **Consumer Activity**: Transactions, digital interactions, and content engagement (e.g., views, listens).
- **Location Data**: Patterns of movement and engagement within specific geographies.
- **Demographics and Psychographics**: Anonymized attributes like age, gender, lifestyle preferences, and interests.

This data forms the foundation of our AI pipeline, enabling us to build robust models that uncover meaningful connections between entities while adhering to strict privacy standards.

## Step 2: AI modeling

Our AI models analyze data signals to uncover patterns and correlations that inform the affinity score. These techniques help identify relationships, evaluate geospatial performance, and retrieve the most relevant tags. Here are a few of the models we use:

- **Co-occurrence Analysis:** Neural networks detect relationships between entities based on shared behaviors or preferences.
- **Geospatial Analysis**: Models evaluate how an entity performs in specific locations compared to regional and global benchmarks.
- **Taste Analysis**: Content models highlight similar attributes between entities.
- **Demographic Insights**: Statistical methods map preferences across population groups.

These models support multiple meanings of the affinity score: they identify similar entities, evaluate performance in specific locations, and generate descriptive tags for a collection of entities.

## Step 3: Calculating the affinity score

We calculate the affinity score by comparing the attributes of entities:

- **Vectorizing Entities**: Entities are represented as data points in a multi-dimensional space, where similar entities are closer together, and dissimilar entities are further apart. This mapping helps identify relationships and inform recommendations.
- **Cosine Similarity**: This measures how similar two entities are based on their vector representations. For example, two music artists with a high cosine similarity score (close to 1) might share a large audience with similar preferences, while a score of 0 indicates no shared connection.

Depending on the use case, this process may instead assess how relevant an entity is to a specific geolocation or break down the tags associated with a taste vector.

> **Still have questions?**
>
> Check out our [FAQs](faqs.md#affinity-score).

## See also

- [Affinity score methodology on docs.qloo.com](https://docs.qloo.com/docs/affinity-score-methodology), fetched 2026-10-16, page updated 2026-10-15
- [Affinity](affinity.md)
- [Interpreting affinity scores](interpreting-affinity-scores.md)
