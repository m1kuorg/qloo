---
updatedAt: 2026-09-18T16:09:45.000Z
---

# Processing Methodology

How signals are processed, machine learning models are applied, and insights are derived.

Qloo’s processing and methodology transform billions of anonymized user interactions into structured insight built on a deep understanding of people and culture. This process begins with raw consumer interactions, known as signals, which are systematically captured and processed to reveal meaningful taste patterns. Using proprietary machine learning models and statistical methodologies, Qloo translates these signals into actionable recommendations spanning categories like music, film, dining, and fashion.

Qloo’s processing pipeline applies:

- Entity classification and metadata structuring to ensure a unified catalog.
- Sentiment analysis and signal validation to filter out noise and maintain high signal quality.
- Aggregation of structured properties, such as restaurant menu details, book settings and characters, brand affinity scores, and more.

## Core Concepts

- **Signal**: A data point representing a consumer interaction with an entity, carrying a weight that reflects magnitude and direction (e.g., purchases and other engagement activity.
- **Taste Vectors**: The final structured outputs power Qloo’s recommendation engine, representing cultural preferences through AI-generated embeddings.

## From Raw Data to Signals

Qloo first captures and processes raw consumer interactions, known as signals, to reveal personalized taste patterns. These signals reflect real-world engagement with cultural entities and form the foundation for all downstream processing.

In the Qloo ecosystem, “signal” refers to consumer interactions with entities. These signals carry a specific weight, indicating the magnitude of the interaction. Signals can include a wide range of consumer interactions, from transactions to content engagement and curation activity. These weighted signals help quantify and qualify user preferences and behaviors.

Qloo’s API processes billions of time-stamped data points monthly, specializing in mapping cross-category signal occurrences. With a single dataset, we can identify transactional signals linking a specific fashion brand to a particular restaurant or correlate preferences for a music artist, TV show, and podcast. This unique capability allows Qloo to uncover meaningful correlations, such as the relationship between a music artist and a specific brand, providing valuable insights that transcend individual categories.

### Transforming Signals into Insights

Once signals are collected, Qloo applies a structured methodology to process and extract meaning from them. This transformation happens in multiple stages:

1. **Batch Signal Processing**: Qloo’s API processes anonymized batch signals spanning various cultural categories, ensuring full GDPR compliance as a data processor.
2. **Signal Decomposition**: Raw signals are broken down into core entity attributes, forming the foundation for model training.
3. **Model Training and Output**: Machine learning models identify taste clusters, generating unique vectors for users, entities, and attributes, which are used in deep learning processes.

## Extracting Meaning Through Statistical Models

After signals have been structured and processed, Qloo’s machine learning frameworks analyze their relationships. The next step is uncovering deeper insights by identifying patterns and cross-category correlations.

### Cross-Category Correlations

Qloo leverages advanced statistical methodologies and machine learning techniques to process and derive meaningful insights from signal flows across categories. By analyzing patterns in user preferences, our models establish cross-category connections, enabling co-occurrence analysis that helps surface meaningful relationships. For a plain-language overview of what these cross-category connections unlock, see [Cross-Category Insights](https://docs.qloo.com/docs/cross-category-insights).

Entity relationships are modeled using:

- **Neural Networks**: These leverage taste co-occurrence data to uncover deep correlations by identifying relationships within a vector space and integrating signal-based taste co-occurrence data with content metadata and similarity metrics.
- **Content-Based Modeling**: These analyze structured metadata to refine entity relationships.
- **Demographic and Psychographic Segmentation**: These enable more precise population-level insights.

To ensure accuracy and reliability, Qloo employs rigorous evaluation metrics, maintains proper population sampling thresholds, and normalizes data capture velocities across categories and signal sources. This approach minimizes biases and preserves the integrity of insights.

## The Final Output: Taste Vectors

The ultimate goal of Qloo’s processing methodology is to create rich, multi-dimensional representations of cultural preferences, known as taste vectors. These embeddings serve as the backbone of Qloo’s recommendation engine, precisely mapping relationships between entities. Entities are mapped into a high-dimensional vector space, where similar entities cluster based on inferred relationships.

Qloo’s proprietary neural networks process billions of structured signals to generate high-dimensional taste embeddings, optimizing recommendations across categories. To process all the data in real-time, Qloo uses proprietary machine learning algorithms rooted in the latest research in the emerging field of Neuroaesthetics. These include:

- Deep learning methods
- Bayesian statistics
- Neural networks
- Proprietary NLP algorithms

Qloo also incorporates geospatial affinity scoring to enhance location-based predictions and market-specific insights, ensuring relevance across diverse geographical areas.
