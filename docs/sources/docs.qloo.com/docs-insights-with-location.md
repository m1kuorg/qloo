---
updatedAt: 2025-05-14T18:48:36.000Z
---

# Location Insights

With the Insights API, you can explore consumer preferences worldwide. Simply enter the name of a location, a <Glossary>geo boundary</Glossary>, or a <Glossary>geo point</Glossary> to discover the most relevant and highly correlated music artists, movies, TV shows, consumer brands, fashion, restaurants, travel preferences, and more.

A combination of filters and other input featues can address complex queries like:

- “What are the most correlated health and beauty brands to the Barbie movie in a specific subsection of Miami, FL?”
- “What movies do Marvin Gaye fans living in Echo Park love?”

# Key Features and Benefits

- **Put Less In, Get More Out**: You don't need any prior segment knowledge- just supply a location. If you want to filter even further, you can filter by<Glossary>entity type</Glossary>, demographic criteria, and more.
- **Custom Geo Boundaries**: Supplying custom geo boundaries in the form of multi-polygons and geofences allows you to target a specific neighborhood or micro-neighborhood. Geo boundaries can also span entire cities and any other arbitrary or administrative boundary, providing an easy path to localized personalization. For example:
  - the waterfront in Brooklyn, NY
  - the narrow primary retail stretch of Abbott Kinney in Venice, CA
  - the museum district in Paris
- **Custom Geo Points**: As an alternative to geo boundaries, you can also enter geo points. This can be helpful for inputting areas with a natural center point, like a particular retail storefront or lease location.
- **No Cold Starts**: Qloo's Insights API is able to generate rich geospatial inferences while completely overcoming any data-cold-starts or sparsity of existing data. The route can be powered entirely by just a single latitude, longitude pair. No DMP (Data Management Platform) data or existing entity arrays need to be passed to generate granular inferences across target domains. This empowers you to generate actionable, turn-key inferences with little to no existing data.
- **Integrate with Existing Tools**: This route can be integrated with proprietary toolings or established DMPs like Adobe and visualization software like Tableau. It's designed so that a single developer can fully onboard Qloo into any pipeline and begin making granular requests across geographies.

# How It Works

The Insights API can provide in-depth, location-specific recommendations using geospatial data and user interactions. This section explains the mechanics behind generating precise insights based on location, user interactions, and <Glossary>affinity scores</Glossary>.

## Location

#### Geohash Tiles

If a shape is provided along with a <Glossary>signal array</Glossary>, the most relevant geolocation is determined based on the density of signals. These associations are mapped to a geohash. A geohash encodes coordinates into a tile that represents a geographic location. We offer seven levels of precision for our geohash tiles, ranging from about 118 meters wide (13,924 square meters) to approximately 625,441 meters wide (391,176,444,481 square meters).

This is how we can predict the taste of various tiles by analyzing the associated signals at various precisions. We employ a dynamic density discovery algorithm to ensure reliable geospatial recommendations over areas with differing densities. Generally, we can analyze sentiment at the highest precision in cities because the density of signal is so high, while in rural areas we will navigate up the geohash hierarchy to find a level of precision that is suitable for that area.

#### Precision Based on Density

By analyzing <Glossary>signals</Glossary> at different levels of precision, we can predict the taste associated with different geohash tiles. We use a dynamic density discovery algorithm to ensure accurate recommendations across areas with different densities. For example, in cities, we analyze signals at the highest precision because of their high density, while in rural areas, we move up the geohash hierarchy to find a suitable level of precision.

## User Interactions

#### Signal Associations with Location

The Insights API produces accurate results by using <Glossary>signal</Glossary> associations that contain geospatial locations. When a user interacts with a specific location, like adding it to an Instagram post, an association is created between that location and the signal. If there are multiple locations in a <Glossary>signal array</Glossary>, that means the signal has occurred with each of the locations. If there are repeated interactions with a location, it will increase its weight.

## Affinity Score

To determine the most important and relevant <Glossary>entities</Glossary> for a selected geographical point, Insights uses an <Glossary>affinity score</Glossary>. [Learn more](https://docs.qloo.com/docs/affinity-score).
