# Filters

We provide comprehensive output filters for every entity category, covering sub-genres within music, film, and TV. Some filters are as granular as price levels for entities like restaurants and hotels.

Contents:

1.  [How it works](#how-it-works)
1.  [Data quality](#data-quality)
1.  [See also](#see-also)

## How it works

Filtering restricts the output to the most strongly correlated entities that match the specified attribute. For example, you can request the most correlated comedy films to an input array or the most relevant Japanese restaurants to a given signal. When multiple filtering attributes are specified, they are treated inclusively (OR condition) by default rather than exclusively (AND condition).

## Data quality

Qloo maintains a rigorous data pipeline and thresholding process to ensure that only high-certainty attributes are appended to entities.

## See also

- [Filters on docs.qloo.com](https://docs.qloo.com/docs/filters), fetched 2026-10-16, page updated 2025-05-14
- [Parameter reference](parameter-reference.md)
