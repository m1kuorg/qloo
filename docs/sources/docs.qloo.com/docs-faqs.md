---
updatedAt: 2026-09-18T16:13:37.000Z
---

# FAQs

# FAQ Index

### [General](https://docs.qloo.com/docs/faqs#general-1)

- [What is Qloo?](#what-is-qloo)
- [How can I access Qloo?](#how-can-i-access-qloo)

### [Data](https://docs.qloo.com/docs/faqs#data-1)

- [Where does Qloo’s data come from?](#where-does-qloos-data-come-from)
- [How often is Qloo’s data updated?](#how-often-is-qloos-data-updated)

### [Affinity Score](https://docs.qloo.com/docs/faqs#affinity-score-1)

- [Why are affinity scores useful?](#why-are-affinity-scores-useful)
- [What exactly does the score mean?](#what-exactly-does-the-score-mean)
- [Why does the definition of an affinity score vary across use cases? Is this a limitation or a feature of the system?](#why-does-the-definition-of-an-affinity-score-vary-across-use-cases-is-this-a-limitation-or-a-feature-of-the-system)
- [Why are the affinity scores for top results so close together?](#why-are-the-affinity-scores-for-top-results-so-close-together)
- [Is there a meaningful difference if one result has an affinity score of 92 and another scores 91?](#is-there-a-meaningful-difference-if-one-result-has-an-affinity-score-of-92-and-another-scores-91)
- [How can I use affinity scores to help choose brand partners or collaborators?](https://docs.qloo.com/docs/faqs#/how-can-i-use-affinity-scores-to-help-choose-brand-partners-or-collaborators)
- [How are index and affinity scores different?](https://docs.qloo.com/docs/faqs#/how-are-index-and-affinity-scores-different)
- [Is the score a percentage of a survey sample?](#is-the-score-a-percentage-of-a-survey-sample)

# General

### What is Qloo?

Qloo is the leading AI company demystifying the intricacies of global consumer tastes and preferences through Taste AI, a privacy-centric intelligence engine that reveals and predicts humans’ nuanced tastes.

### How can I access Qloo?

Access Qloo by integrating with our [Insights API](https://docs.qloo.com/reference/api-overview).

# Data

### Where does Qloo’s data come from?

Qloo has four primary data sources:

1. Proprietary First Party (TasteDive API Ecosystem Cross-domain Panel)
2. Third Party
3. Proprietary Entity Database (Normalized and Structured), with millions of properties, descriptions, and more.
4. Proprietary API Ecosystem Learning Rights (Fortune 500 Financials Anonymized Transactions, JCDecaux, Michelin, Samsung, Netflix, etc.)

And some supplementary sources:

1. This service uses data from OpenStreetMaps, available freely under the Open Database License (ODbL) at <https://www.openstreetmap.org>

### How often is Qloo’s data updated?

Qloo’s data is updated daily, weekly, and monthly, depending on the category, to ensure relevance.

### Does Qloo collect PII?

Qloo does not handle or depend on any personally identifiable information (PII) whatsoever to deliver capabilities.

### Does Qloo require customer data to generate insights?

Qloo is designed to overcome cold starts and does not require customer data to generate insights.

# Affinity Score

### Why are affinity scores useful?

Affinity scores provide actionable insights into the strength of relationships between inputs (like demographics or preferences) and outputs (like brands or locations). They help businesses deliver personalized recommendations, understand audience behavior, and make data-driven decisions across various use cases. [Explore real-world applications.](https://docs.qloo.com/docs/affinity-score#real-world-applications)

### What exactly does the score mean?

The affinity score measures how strongly two entities are connected, with 100 indicating a strong relationship and 0 meaning no correlation. Its meaning varies by context. [Learn more](https://docs.qloo.com/docs/interpreting-affinity-scores#use-cases).

### Why does the definition of an affinity score vary across use cases? Is this a limitation or a feature of the system?

The meaning of an affinity score varies because it is designed to adapt to different contexts: evaluating entity similarities, geospatial relevance, or capturing key characteristics. This flexibility is a feature, not a limitation; it ensures the score remains meaningful and actionable across diverse applications. [Learn more](https://docs.qloo.com/docs/interpreting-affinity-scores#use-cases).

### Why are the affinity scores for top results so close together?

When many results score highly, it often means your input is broad or strongly defined, and the system has found several equally relevant matches. [Learn more.](https://docs.qloo.com/docs/interpreting-affinity-scores#/when-results-score-similarly)

### Is there a meaningful difference if one result has an affinity score of 92 and another scores 91?

Not usually. Small differences often reflect similar relevance. [See how to interpret this.](https://docs.qloo.com/docs/interpreting-affinity-scores#/interpreting-small-differences)

### How are index and affinity scores different?

Affinity scores quantify the strength of a connection, while the index determines the relative order of results. The index prioritizes the most relevant entities within a given query, even when score differences are minor, ensuring that the top result matches the request best.

### How can I use affinity scores to help choose brand partners or collaborators?

Affinity scores can help identify brands that are culturally aligned with your target audience. For guidance on how to interpret and apply scores in these scenarios, see this section
in the [Interpreting Affinity Scores](https://docs.qloo.com/docs/interpreting-affinity-scores#/applying-scores-to-brand-and-campaign-decisions) guide.

### Is the score a percentage of a survey sample?

No, the score is not based on survey data or sample percentages. It is calculated using advanced AI models that analyze relationships between inputs and outputs, such as audience preferences or geospatial relevance. A score of 95, for example, indicates a strong connection between entities, not that 95% of survey respondents preferred it.
