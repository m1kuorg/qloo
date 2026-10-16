# Parameter overview

The **Parameter Reference** and the **Entity Type Parameter Guide** are two companion documents designed to help you craft valid, effective API requests to the Qloo [Insights API](insights-api-deep-dive.md).

Contents:

1.  [Companion guides](#companion-guides)
1.  [How to use these together](#how-to-use-these-together)
    1.  [1. Start with your use case](#1-start-with-your-use-case)
    1.  [2. Review allowed parameters](#2-review-allowed-parameters)
    1.  [3. Learn what each parameter does](#3-learn-what-each-parameter-does)
    1.  [4. Craft your request](#4-craft-your-request)
        1.  [For Italian restaurant recommendations, include these parameters](#for-italian-restaurant-recommendations-include-these-parameters)
        1.  [For movie recommendations from a particular decade and genre, include these parameters](#for-movie-recommendations-from-a-particular-decade-and-genre-include-these-parameters)
1.  [See also](#see-also)

## Companion guides

- [Parameter Reference](parameter-reference.md): A comprehensive dictionary of all supported parameters, with descriptions, formats, and legacy mappings.
- [Entity Type Parameter Guide](entity-type-parameter-guide.md): A lookup matrix that tells you which parameters are valid for which `filter.type` values (e.g., place, movie, brand).

Together, these guides answer two essential questions:

1. _What does this parameter do, and how do I format it?_
2. _Is this parameter allowed for my chosen entity type?_

## How to use these together

### 1. Start with your use case

- Identify the entity type you want to recommend or analyze (e.g., `filter.type=urn:entity:place` for a place recommendation).
- Refer to the Entity Type Parameter Guide and find the table for your target entity type.

### 2. Review allowed parameters

- Under that entity type, review which parameters are required and which are optional.
- Make sure your request includes all required parameters (`filter.type` is always required for the Insights API).

### 3. Learn what each parameter does

- For each allowed parameter in the entity type guide, look it up in the Parameter Reference to understand:
  - What the parameter filters or signals
  - Expected data type (string, integer, etc.).
  - Valid values or formats.
  - Whether it supports advanced modes (e.g., POST body with JSON arrays).

### 4. Craft your request

Build your API request by combining the parameters that are valid for your entity type and whose purpose aligns with your goal.

For example:

#### For Italian restaurant recommendations, include these parameters

- `filter.type=urn:entity:place`
- `filter.tags=urn:tag:genre:place:restaurant:italian`

#### For movie recommendations from a particular decade and genre, include these parameters

- `filter.type=urn:entity:movie`
- `filter.release_year.min=1990`
- `filter.release_year.max=1999`
- `filter.tags=urn:tag:keyword:qloo:romantic_comedy`

> **Looking for our Legacy API?**
>
> Use the [Legacy to Insights Parameter Mapping](legacy-to-insights-parameter-mapping.md) to update your existing v1.0 requests. Not all legacy parameters have direct equivalents, review carefully for behavioral differences.

## See also

- [Parameter overview on docs.qloo.com](https://docs.qloo.com/reference/parameter-overview), fetched 2026-10-16, page updated 2026-03-04
- [Parameter reference](parameter-reference.md)
- [Entity type parameter guide](entity-type-parameter-guide.md)
