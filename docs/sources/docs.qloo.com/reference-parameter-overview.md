---
updatedAt: 2026-03-04T19:21:35.000Z
---

# Parameter Overview

The **Parameter Reference** and the **Entity Type Parameter Guide** are two companion documents designed to help you craft valid, effective API requests to the Qloo [Insights API](https://docs.qloo.com/reference/insights-api-deep-dive#/).

- [Parameter Reference](https://docs.qloo.com/reference/parameters): A comprehensive dictionary of all supported parameters, with descriptions, formats, and legacy mappings.
- [Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type#/): A lookup matrix that tells you which parameters are valid for which `filter.type` values (e.g., place, movie, brand).

Together, these guides answer two essential questions:

1. _What does this parameter do, and how do I format it?_
2. _Is this parameter allowed for my chosen entity type?_

# How to Use These Together

## 1. Start With Your Use Case

- Identify the entity type you want to recommend or analyze (e.g., `filter.type=urn:entity:place` for a place recommendation).
- Refer to the Entity Type Parameter Guide and find the table for your target entity type.

## 2. Review Allowed Parameters

- Under that entity type, review which parameters are required and which are optional.
- Make sure your request includes all required parameters (`filter.type` is always required for the Insights API).

## 3. Learn What Each Parameter Does

- For each allowed parameter in the entity type guide, look it up in the Parameter Reference to understand:
  - What the parameter filters or signals
  - Expected data type (string, integer, etc.).
  - Valid values or formats.
  - Whether it supports advanced modes (e.g., POST body with JSON arrays).

## 4. Craft Your Request

Build your API request by combining the parameters that are valid for your entity type and whose purpose aligns with your goal.

For example:

### For Italian restaurant recommendations, include these parameters:

- `filter.type=urn:entity:place`
- `filter.tags=urn:tag:genre:place:restaurant:italian`

### For movie recommendations from a particular decade and genre, include these parameters:

- `filter.type=urn:entity:movie`
- `filter.release_year.min=1990`
- `filter.release_year.max=1999`
- `filter.tags=urn:tag:keyword:qloo:romantic_comedy`

> 📘 Looking for our Legacy API?
>
> Use the [Legacy to Insights Parameter Mapping](https://docs.qloo.com/reference/legacy-insights-parameter-mapping#/) to update your existing v1.0 requests.\
> Not all legacy parameters have direct equivalents, review carefully for behavioral differences.
