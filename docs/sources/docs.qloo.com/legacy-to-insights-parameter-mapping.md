# Legacy to Insights parameter mapping

This page maps [legacy API (v1.0)](get-api-information.md) parameters to their [Insights API](insights-api-deep-dive.md) equivalents, to help you migrate existing requests.

Use this guide when updating legacy integrations. For full details on Insights parameters, see the [Parameter Overview](parameter-overview.md). Note that not all legacy parameters have direct equivalents; review carefully for any changes in behavior.

> **Related Resources**
>
> - **[Parameter Overview](parameter-overview.md)**: Understand how to choose and format parameters for your request use case.
> - **[Parameter Reference](parameter-reference.md)**: Full definitions of all available parameters, including descriptions, types, and details.
> - **[Entity Type Parameter Guide](entity-type-parameter-guide.md)**: See which parameters are supported for each `filter.type`, including whether they are required or optional.

Contents:

1.  [Filters](#filters)
1.  [Signals](#signals)
1.  [Output](#output)
1.  [See also](#see-also)

## Filters

| Insights Parameter Name                        | API 1.0 Parameter Name |
| :--------------------------------------------- | :--------------------- |
| `filter.address`                               |                        |
| `filter.audience.types`                        |                        |
| `filter.content_rating`                        |                        |
| `filter.date_of_birth.max`                     |                        |
| `filter.date_of_birth.min`                     |                        |
| `filter.date_of_death.max`                     |                        |
| `filter.date_of_death.min`                     |                        |
| `filter.entities`                              | `filter.entity_ids`    |
| `filter.exclude.entities`                      |                        |
| `filter.exclude.entities.query`                |                        |
| `filter.exclude.tags`                          | `exclude.tags`         |
| `operator.exclude.tags`                        |                        |
| `filter.external.exists`                       | `filter.exists`        |
| `operator.filter.external.exists`              |                        |
| `filter.external.resy.count.max`               |                        |
| `filter.external.resy.count.min`               |                        |
| `filter.external.resy.party_size.max`          |                        |
| `filter.external.resy.party_size.min`          |                        |
| `filter.external.resy.rating.max`              |                        |
| `filter.external.resy.rating.min`              |                        |
| `filter.external.tripadvisor.rating.count.max` |                        |
| `filter.external.tripadvisor.rating.count.min` |                        |
| `filter.external.tripadvisor.rating.max`       |                        |
| `filter.external.tripadvisor.rating.min`       |                        |
| `filter.finale_year.max`                       |                        |
| `filter.finale_year.min`                       |                        |
| `filter.gender`                                |                        |
| `filter.geocode.admin1_region`                 |                        |
| `filter.geocode.admin2_region`                 |                        |
| `filter.geocode.country_code`                  |                        |
| `filter.geocode.name`                          |                        |
| `filter.hotel_class.max`                       |                        |
| `filter.hotel_class.min`                       |                        |
| `filter.hours`                                 |                        |
| `filter.ids`                                   |                        |
| `filter.latest_known_year.max`                 |                        |
| `filter.latest_known_year.min`                 |                        |
| `filter.location`                              | `filter.location`      |
| `filter.exclude.location`                      |                        |
| `filter.location.query`                        |                        |
| `filter.exclude.location.query`                |                        |
| `filter.location.geohash`                      |                        |
| `filter.exclude.location.geohash`              |                        |
| `filter.location.radius`                       | `target.radius`        |
| `filter.parents.types`                         |                        |
| `filter.popularity.max`                        |                        |
| `filter.popularity.min`                        | `filter.popularity`    |
| `filter.price_level.max`                       |                        |
| `filter.price_level.min`                       |                        |
| `filter.price_range.from`                      |                        |
| `filter.price_range.to`                        |                        |
| `filter.properties.business_rating.max`        |                        |
| `filter.properties.business_rating.min`        |                        |
| `filter.publication_year.max`                  |                        |
| `filter.publication_year.min`                  |                        |
| `filter.rating.max`                            |                        |
| `filter.rating.min`                            |                        |
| `filter.references_brand`                      | `filter.references`    |
| `filter.release_country`                       |                        |
| `filter.results.entities`                      |                        |
| `filter.results.entities.query`                |                        |
| `operator.filter.release_country`              |                        |
| `filter.release_date.max`                      |                        |
| `filter.release_date.min`                      |                        |
| `filter.release_year.max`                      |                        |
| `filter.release_year.min`                      |                        |
| `filter.tag.types`                             |                        |
| `filter.tags`                                  | `filter.tags`          |
| `operator.filter.tags`                         | operator.filter.tags   |
| `filter.type`                                  | type                   |

## Signals

| Parameter Name                         | API 1.0 Parameter       |
| :------------------------------------- | :---------------------- |
| `bias.trends`                          | `bias.trends`           |
| `signal.demographics.audiences`        | `bias.audiences`        |
| `signal.demographics.audiences.weight` | `bias.audiences.weight` |
| `signal.demographics.age`              | `bias.age`              |
| `signal.demographics.gender`           | `bias.gender`           |
| `signal.interests.entities`            |                         |
| `signal.interests.entities.query`      |                         |
| `signal.interests.tags`                |                         |
| `operator.signal.interests.tags`       |                         |
| `signal.location`                      | `target`                |
| `signal.location.query`                |                         |
| `signal.location.radius`               | `filter.radius`         |

## Output

| Parameter Name            | API 1.0 Parameter |
| :------------------------ | :---------------- |
| `diversify.by`            |                   |
| `diversify.take`          |                   |
| `offset`                  |                   |
| `output.heatmap.boundary` |                   |
| `page`                    | `page`            |
| `sort_by`                 | `sort_by`         |
| `take`                    | `take`            |

## See also

- [Legacy to Insights parameter mapping on docs.qloo.com](https://docs.qloo.com/reference/legacy-insights-parameter-mapping), fetched 2026-10-16, page updated 2025-07-22
- [Parameter overview](parameter-overview.md)
