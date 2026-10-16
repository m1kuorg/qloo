# FAQs

Frequently asked questions about Qloo, its data, and affinity scores, from the Qloo developer documentation.

Contents:

1.  [General](#general)
    1.  [What is Qloo?](#what-is-qloo)
    1.  [How can I access Qloo?](#how-can-i-access-qloo)
1.  [Data](#data)
    1.  [Where does Qloo’s data come from?](#where-does-qloos-data-come-from)
    1.  [How often is Qloo’s data updated?](#how-often-is-qloos-data-updated)
    1.  [Does Qloo collect PII?](#does-qloo-collect-pii)
    1.  [Does Qloo require customer data to generate insights?](#does-qloo-require-customer-data-to-generate-insights)
1.  [Affinity score](#affinity-score)
    1.  [Why are affinity scores useful?](#why-are-affinity-scores-useful)
    1.  [What exactly does the score mean?](#what-exactly-does-the-score-mean)
    1.  [Why does the definition of an affinity score vary across use cases? Is this a limitation or a feature of the system?](#why-does-the-definition-of-an-affinity-score-vary-across-use-cases-is-this-a-limitation-or-a-feature-of-the-system)
    1.  [Why are the affinity scores for top results so close together?](#why-are-the-affinity-scores-for-top-results-so-close-together)
    1.  [Is there a meaningful difference if one result has an affinity score of 92 and another scores 91?](#is-there-a-meaningful-difference-if-one-result-has-an-affinity-score-of-92-and-another-scores-91)
    1.  [How are index and affinity scores different?](#how-are-index-and-affinity-scores-different)
    1.  [How can I use affinity scores to help choose brand partners or collaborators?](#how-can-i-use-affinity-scores-to-help-choose-brand-partners-or-collaborators)
    1.  [Is the score a percentage of a survey sample?](#is-the-score-a-percentage-of-a-survey-sample)
1.  [See also](#see-also)

## General

### What is Qloo?

Qloo is the leading AI company demystifying the intricacies of global consumer tastes and preferences through Taste AI, a privacy-centric intelligence engine that reveals and predicts humans’ nuanced tastes.

### How can I access Qloo?

Access Qloo by integrating with our [Insights API](api-overview.md).

## Data

### Where does Qloo’s data come from?

Qloo has four primary data sources:

1.  Proprietary First Party (TasteDive API Ecosystem Cross-domain Panel)
2.  Third Party
3.  Proprietary Entity Database (Normalized and Structured), with millions of properties, descriptions, and more.
4.  Proprietary API Ecosystem Learning Rights (Fortune 500 Financials Anonymized Transactions, JCDecaux, Michelin, Samsung, Netflix, etc.)

And some supplementary sources:

1.  This service uses data from OpenStreetMaps, available freely under the Open Database License (ODbL) at [openstreetmap.org](https://www.openstreetmap.org)

### How often is Qloo’s data updated?

Qloo’s data is updated daily, weekly, and monthly, depending on the category, to ensure relevance.

### Does Qloo collect PII?

Qloo does not handle or depend on any personally identifiable information (PII) whatsoever to deliver capabilities.

### Does Qloo require customer data to generate insights?

Qloo is designed to overcome cold starts and does not require customer data to generate insights.

## Affinity score

### Why are affinity scores useful?

Affinity scores provide actionable insights into the strength of relationships between inputs (like demographics or preferences) and outputs (like brands or locations). They help businesses deliver personalized recommendations, understand audience behavior, and make data-driven decisions across various use cases. [Explore real-world applications.](affinity.md#real-world-applications)

### What exactly does the score mean?

The affinity score measures how strongly two entities are connected, with 100 indicating a strong relationship and 0 meaning no correlation. Its meaning varies by context. Learn more in [Interpreting affinity scores](interpreting-affinity-scores.md#use-cases).

### Why does the definition of an affinity score vary across use cases? Is this a limitation or a feature of the system?

The meaning of an affinity score varies because it is designed to adapt to different contexts: evaluating entity similarities, geospatial relevance, or capturing key characteristics. This flexibility is a feature, not a limitation; it ensures the score remains meaningful and actionable across diverse applications. Learn more in [Interpreting affinity scores](interpreting-affinity-scores.md#use-cases).

### Why are the affinity scores for top results so close together?

When many results score highly, it often means your input is broad or strongly defined, and the system has found several equally relevant matches. Learn more in [When results score similarly](interpreting-affinity-scores.md#when-results-score-similarly).

### Is there a meaningful difference if one result has an affinity score of 92 and another scores 91?

Not usually. Small differences often reflect similar relevance. [See how to interpret this.](interpreting-affinity-scores.md#interpreting-small-differences)

### How are index and affinity scores different?

Affinity scores quantify the strength of a connection, while the index determines the relative order of results. The index prioritizes the most relevant entities within a given query, even when score differences are minor, ensuring that the top result matches the request best.

### How can I use affinity scores to help choose brand partners or collaborators?

Affinity scores can help identify brands that are culturally aligned with your target audience. For guidance on how to interpret and apply scores in these scenarios, see this section in the [Interpreting Affinity Scores](interpreting-affinity-scores.md#applying-scores-to-brand-and-campaign-decisions) guide.

### Is the score a percentage of a survey sample?

No, the score is not based on survey data or sample percentages. It is calculated using advanced AI models that analyze relationships between inputs and outputs, such as audience preferences or geospatial relevance. A score of 95, for example, indicates a strong connection between entities, not that 95% of survey respondents preferred it.

## See also

- [FAQs on docs.qloo.com](https://docs.qloo.com/docs/faqs), fetched 2026-10-16, page updated 2026-09-18
- [Affinity](affinity.md)
- [Glossary](glossary.md)
