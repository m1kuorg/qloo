# Entity type parameter guide

Select parameters supported by your chosen entity type (`filter.type`).

Use this guide to identify which parameters are supported for your chosen `filter.type` (entity type).

The `filter.type` parameter defines the result type you want insights and recommendations for, such as a brand, place, movie, person, heatmap, or tag. Each `filter.type` value supports a specific set of filters, signals, and output controls tailored to its characteristics.

> **Related Resources**
>
> - **[Parameter Overview](parameter-overview.md)**: Understand how to choose and format parameters for your request use case.
> - **[Parameter Reference](parameter-reference.md)**: Full definitions of all available parameters, including descriptions, types, and details.

Contents:

1.  [Conditional parameters](#conditional-parameters)
    1.  [Artist](#artist)
    1.  [Book](#book)
    1.  [Brand](#brand)
    1.  [Destination](#destination)
    1.  [Heatmap](#heatmap)
    1.  [Movie](#movie)
    1.  [Person](#person)
    1.  [Place](#place)
    1.  [Podcast](#podcast)
    1.  [TV show](#tv-show)
    1.  [Video game](#video-game)
    1.  [Tag](#tag)
    1.  [Deprecated entity types](#deprecated-entity-types)
        1.  [Actor](#actor)
        1.  [Author](#author)
        1.  [Director](#director)
1.  [See also](#see-also)

## Conditional parameters

The parameters you can include in a request depend on the selected `filter.type` value: [Artist](#artist), [Book](#book), [Brand](#brand), [Destination](#destination), [Heatmap](#heatmap), [Movie](#movie), [Person](#person), [Place](#place), [Podcast](#podcast), [Tag](#tag), [TV Show](#tv-show), [Video Game](#video-game).

For each entity type section below, you’ll see:

- A short description of the entity type.
- A table of supported parameters for that type, indicating whether each is required or optional.

### Artist

Represents individuals or groups who create or perform works of art, including musicians, visual artists, and performers. Supported parameters for artists:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | **Required**      |
| `bias.trends`                          | Optional          |
| `filter.exclude.entities`              | Optional          |
| `filter.parents.types`                 | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `offset`                               | Optional          |
| `signal.demographics.age`              | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.interests.entities`            | Optional          |
| `signal.interests.tags`                | Optional          |
| `take`                                 | Optional          |

### Book

Represents written works such as novels, non-fiction books, and other published literary content. Supported parameters for books:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | **Required**      |
| `bias.trends`                          | Optional          |
| `filter.exclude.entities`              | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `filter.parents.types`                 | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.publication_year.min`          | Optional          |
| `filter.publication_year.max`          | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `offset`                               | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.age`              | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.interests.entities`            | Optional          |
| `signal.interests.tags`                | Optional          |
| `take`                                 | Optional          |

### Brand

Represents commercial brands, including retail chains, consumer products, and service companies. Supported parameters for brands:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | **Required**      |
| `bias.trends`                          | Optional          |
| `filter.exclude.entities`              | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `filter.parents.types`                 | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `signal.demographics.age`              | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `signal.interests.entities`            | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.interests.tags`                | Optional          |
| `offset`                               | Optional          |
| `take`                                 | Optional          |

### Destination

Represents geographic destinations, including cities, neighborhoods, or notable areas people visit. Supported parameters for destinations:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | Required          |
| `bias.trends`                          | Optional          |
| `filter.exclude.entities`              | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.geocode.name`                  | Optional          |
| `filter.geocode.admin1_region`         | Optional          |
| `filter.geocode.admin2_region`         | Optional          |
| `filter.geocode.country_code`          | Optional          |
| `filter.location`                      | Optional          |
| `filter.location.radius`               | Optional          |
| `filter.location.geohash`              | Optional          |
| `filter.exclude.location.geohash`      | Optional          |
| `filter.parents.types`                 | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `offset`                               | Optional          |
| `signal.demographics.age`              | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.interests.entities`            | Required          |
| `signal.interests.tags`                | Optional          |
| `take`                                 | Optional          |

### Heatmap

Represents geospatial heatmap results. Supported parameters for heatmaps:

| Parameter Name                  | Required/Optional |
| ------------------------------- | ----------------- |
| `filter.type`                   | **Required**      |
| `filter.location`               | Optional          |
| `filter.location.query`         | Optional          |
| `filter.location.radius`        | Optional          |
| `heatmap.dimensions`            | Optional          |
| `filter.dimensions.hotel_class` | Optional          |
| `filter.dimensions.price_level` | Optional          |
| `output.heatmap.boundary`       | Optional          |
| `signal.demographics.age`       | Optional          |
| `signal.demographics.audiences` | Optional          |
| `signal.demographics.gender`    | Optional          |
| `signal.interests.entities`     | Optional          |
| `signal.interests.tags`         | Optional          |
| `take`                          | Optional          |

`heatmap.dimensions` applies only when `filter.type=urn:heatmap` and `output.heatmap.boundary=urn:geohash`. Use `filter.dimensions.hotel_class` only when `hotel_class` is included in `heatmap.dimensions`, and use `filter.dimensions.price_level` only when `price_level` is included in `heatmap.dimensions`.

### Movie

Represents feature-length films and cinematic works. Supported parameters for movies:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | **Required**      |
| `bias.trends`                          | Optional          |
| `filter.content_rating`                | Optional          |
| `filter.exclude.entities`              | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.parents.types`                 | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.release_year.min`              | Optional          |
| `filter.release_year.max`              | Optional          |
| `filter.release_country`               | Optional          |
| `operator.filter.release_country`      | Optional          |
| `filter.rating.min`                    | Optional          |
| `filter.rating.max`                    | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `offset`                               | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.age`              | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.interests.entities`            | Optional          |
| `signal.interests.tags`                | Optional          |
| `take`                                 | Optional          |

### Person

Represents individual people, encompassing all roles such as actors, authors, directors, politicians, and public figures. Supported parameters for people:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | **Required**      |
| `bias.trends`                          | Optional          |
| `filter.date_of_birth.min`             | Optional          |
| `filter.date_of_birth.max`             | Optional          |
| `filter.date_of_death.min`             | Optional          |
| `filter.date_of_death.max`             | Optional          |
| `filter.exclude.entities`              | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.gender`                        | Optional          |
| `filter.parents.types`                 | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `offset`                               | Optional          |
| `signal.demographics.age`              | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.interests.entities`            | Optional          |
| `signal.interests.tags`                | Optional          |
| `take`                                 | Optional          |

### Place

Represents points of interest, such as restaurants, hotels, venues, landmarks, and businesses, tied to a specific physical location. Supported parameters for places:

| Parameter Name                                 | Required/Optional |
| ---------------------------------------------- | ----------------- |
| `filter.type`                                  | **Required**      |
| `bias.trends`                                  | Optional          |
| `bias.quality`                                 | Optional          |
| `filter.address`                               | Optional          |
| `filter.exclude.entities`                      | Optional          |
| `filter.exclude.tags`                          | Optional          |
| `operator.exclude.tags`                        | Optional          |
| `filter.external.exists`                       | Optional          |
| `operator.filter.external.exists`              | Optional          |
| `filter.external.tripadvisor.rating.count.max` | Optional          |
| `filter.external.tripadvisor.rating.count.min` | Optional          |
| `filter.external.tripadvisor.rating.max`       | Optional          |
| `filter.external.tripadvisor.rating.min`       | Optional          |
| `filter.geocode.name`                          | Optional          |
| `filter.geocode.admin1_region`                 | Optional          |
| `filter.geocode.admin2_region`                 | Optional          |
| `filter.geocode.country_code`                  | Optional          |
| `filter.hotel_class.max`                       | Optional          |
| `filter.hotel_class.min`                       | Optional          |
| `filter.hours`                                 | Optional          |
| `filter.location`                              | Optional          |
| `filter.location.geohash`                      | Optional          |
| `filter.exclude.location.geohash`              | Optional          |
| `filter.location.radius`                       | Optional          |
| `filter.parents.types`                         | Optional          |
| `filter.popularity.min`                        | Optional          |
| `filter.popularity.max`                        | Optional          |
| `filter.price_level.min`                       | Optional          |
| `filter.price_level.max`                       | Optional          |
| `filter.price_range.from`                      | Optional          |
| `filter.price_range.to`                        | Optional          |
| `filter.properties.business_rating.min`        | Optional          |
| `filter.properties.business_rating.max`        | Optional          |
| `filter.properties.resy.rating.min`            | Optional          |
| `filter.properties.resy.rating.max`            | Optional          |
| `filter.references_brand`                      | Optional          |
| `filter.results.entities`                      | Optional          |
| `filter.results.entities.query`                | Optional          |
| `filter.resy.rating_count.min`                 | Optional          |
| `filter.resy.rating_count.max`                 | Optional          |
| `filter.resy.rating.party.min`                 | Optional          |
| `filter.resy.rating.party.max`                 | Optional          |
| `filter.tags`                                  | Optional          |
| `operator.filter.tags`                         | Optional          |
| `offset`                                       | Optional          |
| `signal.demographics.age`                      | Optional          |
| `signal.demographics.audiences`                | Optional          |
| `signal.demographics.audiences.weight`         | Optional          |
| `signal.demographics.gender`                   | Optional          |
| `signal.interests.entities`                    | Optional          |
| `signal.interests.tags`                        | Optional          |
| `sort_by`                                      | Optional          |
| `take`                                         | Optional          |

`bias.quality` and `sort_by=quality` apply only to places with a quality score. When `sort_by=quality` is set, place results are ordered by quality score from highest to lowest.

### Podcast

Represents episodic audio series and shows distributed through podcast platforms. Supported parameters for podcasts:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | **Required**      |
| `bias.trends`                          | Optional          |
| `filter.exclude.entities`              | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `filter.parents.types`                 | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `offset`                               | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.demographics.age`              | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `signal.interests.entities`            | Optional          |
| `signal.interests.tags`                | Optional          |
| `take`                                 | Optional          |

### TV show

Represents television content, including scripted series, reality shows, and specials. Supported parameters for TV shows:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | **Required**      |
| `bias.trends`                          | Optional          |
| `filter.content_rating`                | Optional          |
| `filter.exclude.entities`              | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.finale_year.max`               | Optional          |
| `filter.finale_year.min`               | Optional          |
| `filter.latest_known_year.max`         | Optional          |
| `filter.latest_known_year.min`         | Optional          |
| `filter.parents.types`                 | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.release_year.max`              | Optional          |
| `filter.release_year.min`              | Optional          |
| `filter.release_country`               | Optional          |
| `operator.filter.release_country`      | Optional          |
| `filter.rating.max`                    | Optional          |
| `filter.rating.min`                    | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `offset`                               | Optional          |
| `signal.demographics.age`              | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.interests.entities`            | Optional          |
| `signal.interests.tags`                | Optional          |
| `take`                                 | Optional          |

### Video game

Represents interactive digital games available on various gaming platforms. Supported parameters for video games:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | **Required**      |
| `bias.trends`                          | Optional          |
| `filter.exclude.entities`              | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `filter.parents.types`                 | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `offset`                               | Optional          |
| `signal.demographics.age`              | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.interests.entities`            | Optional          |
| `signal.interests.tags`                | Optional          |
| `take`                                 | Optional          |

### Tag

Represents tag results. Supported parameters for tags:

| Parameter Name   | Required/Optional |
| ---------------- | ----------------- |
| `filter.type`    | **Required**      |
| `diversify.by`   | Optional          |
| `diversify.take` | Optional          |
| `offset`         | Optional          |
| `take`           | Optional          |

Use `diversify.by=subtype` with `filter.type=urn:tag` to cap results per tag subtype before paging. Set the cap with `diversify.take`.

### Deprecated entity types

> The following entity types are deprecated. We recommend using the Person entity type instead.

#### Actor

**Deprecated:** Use the Person entity type instead.

If your request is for actors, these are the parameters you can use:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | **Required**      |
| `signal.interests.entities`            | Optional          |
| `signal.interests.tags`                | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.demographics.age`              | Optional          |
| `bias.trends`                          | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `filter.exclude.entities`              | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `offset`                               | Optional          |
| `take`                                 | Optional          |

#### Author

**Deprecated:** Use the Person entity type instead.

If your request is for authors, these are the parameters you can use:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | **Required**      |
| `signal.interests.entities`            | Optional          |
| `signal.interests.tags`                | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.demographics.age`              | Optional          |
| `bias.trends`                          | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `filter.exclude.entities`              | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.publication_year.min`          | Optional          |
| `filter.publication_year.max`          | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `offset`                               | Optional          |
| `take`                                 | Optional          |

#### Director

**Deprecated:** Use the Person entity type instead.

If your request is for directors, these are the parameters you can use:

| Parameter Name                         | Required/Optional |
| -------------------------------------- | ----------------- |
| `filter.type`                          | **Required**      |
| `signal.interests.entities`            | Optional          |
| `signal.interests.tags`                | Optional          |
| `signal.demographics.gender`           | Optional          |
| `signal.demographics.age`              | Optional          |
| `bias.trends`                          | Optional          |
| `signal.demographics.audiences`        | Optional          |
| `signal.demographics.audiences.weight` | Optional          |
| `filter.exclude.entities`              | Optional          |
| `filter.popularity.min`                | Optional          |
| `filter.popularity.max`                | Optional          |
| `filter.results.entities`              | Optional          |
| `filter.results.entities.query`        | Optional          |
| `filter.tags`                          | Optional          |
| `operator.filter.tags`                 | Optional          |
| `filter.exclude.tags`                  | Optional          |
| `operator.exclude.tags`                | Optional          |
| `filter.external.exists`               | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `operator.filter.external.exists`      | Optional          |
| `take`                                 | Optional          |

## See also

- [Entity type parameter guide on docs.qloo.com](https://docs.qloo.com/reference/available-parameters-by-entity-type), fetched 2026-10-16, page updated 2026-07-08
- [Parameter overview](parameter-overview.md)
- [Parameter reference](parameter-reference.md)
