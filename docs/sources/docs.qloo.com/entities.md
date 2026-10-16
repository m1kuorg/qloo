# Entities

Notable people, places, things, and interests.

Contents:

1.  [Overview](#overview)
1.  [Entity categories/types](#entity-categoriestypes)
1.  [Entity validation](#entity-validation)
1.  [Metadata](#metadata)
1.  [Entity reconciliation service](#entity-reconciliation-service)
1.  [See also](#see-also)

## Overview

Entities are a core concept within the Qloo ecosystem, representing notable people, places, things, and interests.

Each entity represents a node that Qloo recognizes and has built inferential intelligence around. Qloo's AI recognizes a vast and constantly growing set of individual entities, any one of which can be referenced to retrieve correlated, filtered entities by taste and attributes. Entities are assigned a type, like "artist", "brand", or "destination". Find a complete list of entity types [below](#entity-categoriestypes). Each entity has a Qloo ID, a stable GUID used across the API.

> **Entities vs Interests**
>
> You may also see entities referred to as interests.

## Entity categories/types

Entities are classified by type, such as books, movies, and music. Below is a comprehensive list of entity categories:

- Artist
- Book
- Brand
- Locality
- Movie
- Person
- Place
- Podcast
- TV Show
- Video Game

## Entity validation

We employ a multi-step validation process to ensure the accuracy and relevance of entities in our catalog. Entities must meet a minimum interaction threshold percentile to be considered valid, ensuring they have sufficient engagement for meaningful associations. Additionally, entities must contain adequate metadata and properties to support robust connections. To maintain data integrity, we continuously update entity mappings by reconciling information from multiple sources, resolving inconsistencies, and filtering out erroneous identifiers.

## Metadata

Tags are a type of entity in the Qloo ecosystem that serve as labels, categorizing and enriching other entities to make them easier to search, filter, and distinguish. They represent various categories or characteristics that help define and identify the content they are associated with.

Tags include disambiguating details, such as restaurant addresses and film release dates, that help differentiate similarly named entities. Attributes span various data formats, from integers and strings (e.g., title, address) to boolean values and ISO 8601 dates (e.g., release dates). Some attributes also reference other entities, such as the relationship between a music artist and their album.

Some examples of tags include "Great Shopping", "Outdoor Activities", and "Foodie Destination". There are endless tags available in our system, making it easier to understand the information associated with an entity or drill down and filter your results.

## Entity reconciliation service

For advanced enterprise use cases, we offer an entity reconciliation service that ingests client entities and provides a table of Qloo IDs matched to client entity IDs.

## See also

- [Entities on docs.qloo.com](https://docs.qloo.com/docs/entities), fetched 2026-10-16, page updated 2026-09-18
- [Glossary](glossary.md)
- [Schema and taxonomy](schema-and-taxonomy.md)
