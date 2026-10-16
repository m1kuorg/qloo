---
updatedAt: 2026-07-08T16:31:19.000Z
---

# Parameter Reference

This is a comprehensive list of parameters for the Insights API:

- **Filters**: Specify _what kind of results you want_. These parameters narrow the results to a specific entity type (like movies, places, or artists), tags, or location.
- **Signals**: Specify _what to base the recommendations on_. These parameters influence the ranking by providing context, such as audience demographics, user interests, or related entities.
- **Output**: Specify _how the results are presented_. These parameters control aspects like the number of results displayed (`take`) and which page of results to show (`page`).

> 📘 Related Resources
>
> - **[Parameter Overview](https://docs.qloo.com/reference/parameter-overview#/)**: Understand how to choose and format parameters for your request use case.
> - **[Entity Type Parameter Guide](https://docs.qloo.com/reference/available-parameters-by-entity-type#/)**: View parameters sorted by supported `filter.type` instead.

<Tabs>
  <Tab title="Filters">
    <HTMLBlock>{`
                                                                                                                                    <table style="width: 100%; border-collapse: collapse;">
                                                                                                                                    <thead>
                                                                                                                                    <tr>
                                                                                                                                      <th style="border: 1px solid #ddd; padding: 8px;">Parameter Name</th>
                                                                                                                                      <th style="border: 1px solid #ddd; padding: 8px;">Type</th>
                                                                                                                                      <th style="border: 1px solid #ddd; padding: 8px;">Description</th>
                                                                                                                                      <th style="border: 1px solid #ddd; padding: 8px;">Compatible Entity Types</th>
                                                                                                                                    </tr>
                                                                                                                                    </thead>
                                                                                                                                    <tbody>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.address</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by address using a partial string match. Supports comma-separated terms.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;">Place</td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.audience.types</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>array of strings</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a list of audience types.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.content_rating</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a comma-separated list of content ratings based on the MPAA film rating system, which determines suitability for various audiences.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;">Movie, TV Show</td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.date_of_birth.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string, YYYY-MM-DD</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the most recent date of birth desired for the queried person.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;">Person</td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.date_of_birth.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string, YYYY-MM-DD</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the earliest date of birth desired for the queried person.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;">Person</td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.date_of_death.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string, YYYY-MM-DD</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the most recent date of death desired for the queried person.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;">Person</td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.date_of_death.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string, YYYY-MM-DD</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the earliest date of death desired for the queried person.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;">Person</td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.dimensions.hotel_class</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>array of integers</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Restricts the <code>hotel_class</code> heatmap dimension to specified hotel classes from 1–5. When set, the dimension score reflects the proportion of hotels in the selected classes and adds <code>hotel_class_count_affinity_rank</code> and <code>hotel_class_count_affinity</code> to the response. Requires <code>hotel_class</code> in <code>heatmap.dimensions</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;">Heatmap</td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.dimensions.price_level</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>array of integers</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Restricts the <code>price_level</code> heatmap dimension to specified price tiers from 1–4. When set, the dimension score reflects the proportion of places at the selected price levels and adds <code>price_level_count_affinity_rank</code> and <code>price_level_count_affinity</code> to the response. Requires <code>price_level</code> in <code>heatmap.dimensions</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;">Heatmap</td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.entities</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a comma-separated list of entity IDs. Often used to assess the affinity of an entity towards input.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.entity_ids</code></p>
                                                                                                                                    </td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.exclude.entities</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>A comma-separated list of entity IDs to remove from the results.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.exclude.entities.query</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>This parameter can only be supplied when using POST HTTP method, since it requires JSON encoded body. The value for <code>filter.exclude.entities.query</code> is a JSON array with objects containing the <code>name</code> and <code>address</code> properties. For a fuzzier search, just include an array of strings. When supplied, it overwrites the <code>filter.exclude.entities</code> object with resolved entity IDs. The response will contain a path <code>query.entities.exclude</code>, with partial Qloo entities that were matched by the query. If no entities are found, the API will throw a <code>400</code> error.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.exclude.tags</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Exclude entities associated with a comma-separated list of tags.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                                    </td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>operator.exclude.tags</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Specifies how multiple <code>filter.exclude.tags</code> values are combined in the query. Use &quot;union&quot; (equivalent to a logical &quot;or&quot;) to exclude results that contain at least one of the specified tags, or &quot;intersection&quot; (equivalent to a logical &quot;and&quot;) to exclude only results that contain all specified tags. The default is &quot;union&quot;.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.external.exists</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a comma-separated list of external keys.<br>(<code>resy</code>|<code>michelin</code>|<code>tablet</code>).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                                    </td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>operator.filter.external.exists</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Specifies how multiple <code>filter.external.exists</code> values are combined in the query. Use &quot;union&quot; (equivalent to a logical &quot;or&quot;) to return results that match at least one of the specified external keys (e.g., resy, michelin, or tablet), or &quot;intersection&quot; (equivalent to a logical &quot;and&quot;) to return only results that match all specified external keys. The default is &quot;union&quot;.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.external.resy.count.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>  Filter places to include only those with a Resy rating count less than or equal to the specified maximum. Applies only to entities with <code>filter.type</code> of <code>urn:entity:place</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.external.resy.count.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter places to include only those with a Resy rating count greater than or equal to the specified minimum. Applies only to entities with <code>filter.type</code> of <code>urn:entity:place</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.external.resy.party_size.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the maximum supported party size required for a Point of Interest.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.external.resy.party_size.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the minimum supported party size required for a Point of Interest.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.external.resy.rating.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>float</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter places to include only those with a Resy rating less than or equal to the specified maximum (1–5 scale). Applies only to entities with <code>filter.type</code> of <code>urn:entity:place</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.external.resy.rating.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>float</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter places to include only those with a Resy rating greater than or equal to the specified minimum (1–5 scale). Applies only to entities with <code>filter.type</code> of <code>urn:entity:place</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.external.tripadvisor.rating.count.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter places to include only those with a Tripadvisor review count less than or equal to the specified maximum.<br>  This filter only applies to entities with <code>filter.type</code> of <code>urn:entity:place</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.external.tripadvisor.rating.count.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter places to include only those with a Tripadvisor review count greater than or equal to the specified minimum.<br>  This filter only applies to entities with <code>filter.type</code> of <code>urn:entity:place</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.external.tripadvisor.rating.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>float</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter places to include only those with a Tripadvisor rating less than or equal to the specified maximum. This filter only applies to entities with <code>filter.type</code> of <code>urn:entity:place</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.external.tripadvisor.rating.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>float</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter places to include only those with a Tripadvisor rating greater than or equal to the specified minimum. This filter only applies to entities with <code>filter.type</code> of <code>urn:entity:place</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.finale_year.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the latest desired year for the final season of a TV show.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>TV Show</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.finale_year.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the earliest desired year for the final season of a TV show.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>TV Show</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.gender</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter results to align with a specific gender identity. Used to personalize output based on known or inferred gender preferences.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Person</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.geocode.admin1_region</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by <code>properties.geocode.admin1_region</code>. Exact match (usually state).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Destination, Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.geocode.admin2_region</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by <code>properties.geocode.admin2_region</code>. Exact match (often county or borough).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Destination, Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.geocode.country_code</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by <code>properties.geocode.country_code</code>. Exact match (two-letter country code).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Destination, Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.geocode.name</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by <code>properties.geocode.name</code>. Exact match (usually city or town name).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Destination, Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.hotel_class.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the maximum desired hotel class (1-5, inclusive).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.hotel_class.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the minimum desired hotel class (1-5, inclusive).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.hours</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the day of the week the Point of Interest must be open (Monday, Tuesday, etc.).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.ids</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a comma-separated list of audience IDs.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.latest_known_year.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a certain maximum year that shows were released or updated.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>TV Show</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.latest_known_year.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a certain minimum year that shows were released or updated.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>TV Show</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.location</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a WKT <code>POINT</code>, <code>POLYGON</code>, <code>MULTIPOLYGON</code> or a single Qloo ID for a named <code>urn:entity:locality</code>.  </p>
                                                                                                                                    <p>WKT is formatted as X then Y, therefore longitude is first (<code>POINT(-73.99823 40.722668)</code>).  </p>
                                                                                                                                    <p>If a Qloo ID or WKT <code>POLYGON</code> is passed, <code>filter.location.radius</code> will create a &lt;<a href="glossary:fuzzy">glossary:fuzzy</a>&gt; boundary when set to a value &gt; 0.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Destination, Place</p>
                                                                                                                                    </td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.exclude.location</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Exclude results that fall within a specific location, defined by either a WKT <code>POINT</code>, <code>POLYGON</code>, <code>MULTIPOLYGON</code>, or a Qloo ID for a named <code>urn:entity:locality</code>.<br>  WKT is formatted with longitude first (e.g., <code>POINT(-73.99823 40.722668)</code>).<br>  When using a locality ID or a WKT <code>POLYGON</code>, setting <code>filter.location.radius</code> to a value &gt; 0 creates a fuzzy exclusion boundary.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Destination, Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.location.query</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>A query used to search for one or more named <code>urn:entity:locality</code> Qloo IDs for filtering requests, equivalent to passing the same Locality Qloo ID(s) into <code>filter.location</code>.  </p>
                                                                                                                                    <ul>
                                                                                                                                    <li>For GET requests: Provide a single locality query as a string.</li>
                                                                                                                                    <li>For POST requests:<ul>
                                                                                                                                    <li>You can still send a single locality as a string.</li>
                                                                                                                                    <li>Or you can send an array of locality names to query multiple localities at once. When multiple localities are provided, their geographic shapes are merged, and the system returns results with the highest affinities across the combined area.Locality queries are fuzzy-matched and case-insensitive. Examples include <code>New York City</code>, <code>Garden City</code>, <code>New York</code>, <code>Los Angeles</code>, <code>Lower East Side</code>, and AKAs like <code>The Big Apple</code>. When a single locality is supplied, the response JSON includes <code>query.locality.signal</code> with the matched Qloo entity. If multiple are supplied, this field is omitted. By default, the API includes a tuning that also captures nearby entities just outside the official boundaries of the locality. To turn this off and limit results strictly to within the locality, set <code>filter.location.radius=0</code>. If no localities are found, the API returns a 400 error.</li>
                                                                                                                                    </ul>
                                                                                                                                    </li>
                                                                                                                                    </ul>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Destination, Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.exclude.location.query</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Exclude results that fall within a specific location, defined by either a WKT <code>POINT</code>, <code>POLYGON</code>, <code>MULTIPOLYGON</code>, or a Qloo ID for a named <code>urn:entity:locality</code>.<br>  WKT is formatted with longitude first (e.g., <code>POINT(-73.99823 40.722668)</code>).<br>  When using a locality ID or a WKT <code>POLYGON</code>, setting <code>filter.location.radius</code> to a value &gt; 0 creates a fuzzy exclusion boundary.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Destination, Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.location.geohash</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a geohash. Geohashes are generated using the Python package pygeohash with a precision of 12 characters. This parameter returns all POIs that start with the specified geohash. For example, supplying <code>dr5rs</code> would allow returning the geohash <code>dr5rsjk4sr2w</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Destination, Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.exclude.location.geohash</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Exclude all entities whose geohash starts with the specified prefix.<br>  Geohashes are generated using the Python package <code>pygeohash</code> with a precision of 12 characters.<br>  For example, supplying <code>dr5rs</code> would exclude any result whose geohash begins with <code>dr5rs</code>, such as <code>dr5rsjk4sr2w</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Destination, Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.location.radius</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the radius (in meters) when also supplying <code>filter.location</code> or <code>filter.location.query</code>.<br>When this parameter is not provided, the API applies a default tuning that slightly expands the locality boundary to include nearby entities outside its official shape.<br>To disable this behavior and strictly limit results to entities inside the defined locality boundary, set <code>filter.location.radius=0</code>.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Destination, Place</p>
                                                                                                                                    </td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.parents.types</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>array of strings</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a comma-separated list of parental entity types (<code>urn:entity:place</code>). Each type must match exactly.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.popularity.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>number</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the maximum popularity percentile a Point of Interest must have (float, between 0 and 1; closer to 1 indicates higher popularity, e.g., 0.98 for the 98th percentile).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.popularity.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>number</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the minimum popularity percentile required for a Point of Interest (float, between 0 and 1; closer to 1 indicates higher popularity, e.g., 0.98 for the 98th percentile).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                                    </td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.price_level.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the maximum price level a restaurant can have. Accepts values 1–4, where higher numbers indicate more expensive restaurants (similar to dollar signs). Applies only to Places entities.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.price_level.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the minimum price level a restaurant can have. Accepts values 1–4, where higher numbers indicate more expensive restaurants (similar to dollar signs). Applies only to Places entities.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>

                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.price_range.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the maximum price in the desired hotel price range. Accepts an integer between 0 and 1,000,000. Applies only to Places entities.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>

        <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.price_range.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the minimum price in the desired hotel price range. Accepts an integer between 0 and 1,000,000. Applies only to Places entities.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.properties.business_rating.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>float</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the highest desired business rating.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.properties.business_rating.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>float</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the lowest desired business rating.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.publication_year.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>number</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the latest desired year of initial publication for the work.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Book</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.publication_year.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>number</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the earliest desired year of initial publication for the work.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Book</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.rating.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>number</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the maximum Qloo rating a Point of Interest must have (float, between 0 and 5).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Movie, TV Show</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.rating.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>number</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the minimum Qloo rating a Point of Interest must have (float, between 0 and 5).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Movie, TV Show</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.references_brand</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>array of strings</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a comma-separated list of brand entity IDs. Use this to narrow down place recommendations to specific brands. For example, to include only Walmart stores, pass the Walmart brand ID. Each ID must match exactly.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p>
                                                                                                                                    </td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.release_country</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>array of strings</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a list of countries where a movie or TV show was originally released.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Movie, TV Show</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.results.entities</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a comma-separated list of entity IDs. Often used to assess the affinity of an entity towards input.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.results.entities.query</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Search for one or more entities by name to use as filters.  </p>
                                                                                                                                    <ul>
                                                                                                                                    <li>For <strong>GET requests</strong>: Provide a single entity name as a string.</li>
                                                                                                                                    <li>For <strong>POST requests</strong>: You can provide a single name or an array of names.</li>
                                                                                                                                    </ul>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>operator.filter.release_country</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Specifies how multiple <code>filter.release_country</code> values are combined in the query. Use &quot;union&quot; (equivalent to a logical &quot;or&quot;) to return results that match at least one of the specified countries, or &quot;intersection&quot; (equivalent to a logical &quot;and&quot;) to return only results that match all specified countries. The default is &quot;union&quot;.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Movie, TV Show</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.release_date.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string, YYYY-MM-DD</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the latest desired release date.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.release_date.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string, YYYY-MM-DD</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the earliest desired release date.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.release_year.max</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the latest desired release year.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Movie, TV Show</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.release_year.min</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the earliest desired release year.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Movie, TV Show</p></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.tag.types</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>array of strings</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a comma-separated list of audience types. Each audience type requires an exact match. You can retrieve a complete list of audience types via the v2/audiences/types route.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.tags</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by a comma-separated list of tag IDs (urn:tag:genre:restaurant:Italian).</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                                    </td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>operator.filter.tags</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Specifies how multiple <code>filter.tags</code> values are combined in the query. Use &quot;union&quot; (equivalent to a logical &quot;or&quot;) to return results that match at least one of the specified tags, or &quot;intersection&quot; (equivalent to a logical &quot;and&quot;) to return only results that match all specified tags. The default is &quot;union&quot;.</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                                    </td>
                                                                                                                                    </tr>
                                                                                                                                    <tr>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>filter.type</code></p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Filter by the &lt;&lt;glossary:entity type&gt;&gt; to return (urn:entity:place). </p>
                                                                                                                                    </td>
                                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                                    </td>
                                                                                                                                    </tr>
                                                                                                                                    </tbody>
                                                                                                                                    </table>
    `}</HTMLBlock>

  </Tab>

  <Tab title="Signals">
    <HTMLBlock>{`
                                                                                                                    <table style="width: 100%; border-collapse: collapse;">
                                                                                                                    <thead>
                                                                                                                    <tr>
                                                                                                                      <th style="border: 1px solid #ddd; padding: 8px;">Parameter Name</th>
                                                                                                                      <th style="border: 1px solid #ddd; padding: 8px;">Type</th>
                                                                                                                      <th style="border: 1px solid #ddd; padding: 8px;">Description</th>
                                                                                                                      <th style="border: 1px solid #ddd; padding: 8px;">Compatible Entity Types</th>
                                                                                                                    </tr>
                                                                                                                    </thead>
                                                                                                                    <tbody>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>bias.trends</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>The level of impact a trending entity has on the results. Supported by select categories only.</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                    </td>
                                                                                                                    </tr>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>bias.quality</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>number or string</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Adds a quality-based contribution to place ranking. Accepts a positive number or weight string (<code>low</code>, <code>medium</code>, or <code>high</code>). Composes with <code>sort_by=quality</code>; when both are set, <code>sort_by=quality</code> controls ordering. Places without a quality score are filtered out. Applies only when <code>filter.type=urn:entity:place</code>.</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Place</p>
                                                                                                                    </td>
                                                                                                                    </tr>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>signal.demographics.audiences</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>array of strings</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>A comma-separated list of audiences that influence the affinity score. Audience IDs can be retrieved via the v2/audiences search route.</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                    </td>
                                                                                                                    </tr>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>signal.demographics.audiences.weight</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Specifies the extent to which results should be influenced by the preferences of the chosen audience.</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                    </td>
                                                                                                                    </tr>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>signal.demographics.age</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>A comma-separated list of age ranges that influence the affinity score. (24_and_younger | 25_to_29 | 30_to_34 | 35_to_44 | 45_to_54 | 55_and_older)</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                    </td>
                                                                                                                    </tr>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>signal.demographics.gender</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Specifies whether to influence the affinity score based on gender (male|female).</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                    </td>
                                                                                                                    </tr>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>signal.interests.entities</code></p></td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>array of strings</p></td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;">
                                                                                                                        <p>A list of entity IDs that influence the affinity score. You can also include a <code>weight</code> property to indicate the strength of influence for each entity.</p>
                                                                                                                        <ul>
                                                                                                                          <li>For <code>GET</code> requests: Provide a comma-separated list of entity IDs.</li>
                                                                                                                          <li>For <code>POST</code> requests, you can either:<br>
                                                                                                                            -- Send the same string of comma-separated values.<br>
                                                                                                                            -- Send an array of objects with <code>entity</code> and <code>weight</code> properties, such as:<br>
                                                                                                                            <code>[
                                                                                                                              { "entity": "urn:entity:movie:inception", "weight": 10 },
                                                                                                                              { "entity": "urn:entity:movie:interstellar", "weight": 25 }
                                                                                                                            ]</code><br>
                                                                                                                            Weights must be greater than 0 and are relative. A weight of 25 means that entity will more heavily influence affinity scores than a weight of 10.
                                                                                                                          </li>
                                                                                                                        </ul>
                                                                                                                      </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                    </tr>

                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>signal.interests.entities.query</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"></td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>This parameter can only be supplied when using the POST HTTP method, which requires a JSON-encoded body. The value for <code>signal.interests.entities.query</code> is a JSON array containing objects with name and address properties. For a fuzzier search, you can provide an array of strings. When supplied, it overwrites the <code>signal.interests.entities</code> object with resolved entity IDs. The response will contain a path, <code>query.entities.signal</code>, with partial Qloo entities that were matched by the query. If no entities are found, a 400 error will be thrown by the API.  </p>
                                                                                                                    <p>Additionally, you can specify how each signal.interests.entities.query item should resolve. The<code>resolve_to</code> property determines whether to resolve to a place, brand, or both. Options are:  </p>
                                                                                                                    <ul>
                                                                                                                    <li><p><code>self</code>: Resolves to a place (default behavior if resolve_to is omitted)</p>
                                                                                                                    </li>
                                                                                                                    <li><p><code>urn:reference:brand</code>: Resolves to the brand.</p>
                                                                                                                    </li>
                                                                                                                    <li><p><code>both</code>: Resolves to both a place and a brand<strong>Behavior</strong>:</p>
                                                                                                                    </li>
                                                                                                                    <li><p>The system will attempt to resolve to a place. If <code>both</code> or <code>urn:reference:brand</code> is used, it will also pull the brand associated with the resolved place.</p>
                                                                                                                    </li>
                                                                                                                    <li><p>Resolved entities are returned inside the <code>response.query</code> object:<br>--- If <code>self</code> or no <code>resolve_to</code> option is provided, the resolved place will include an index property pointing to the position of the query in <code>signal.interests.entities.query</code>.<br>--- If <code>urn:reference:brand</code> is provided and the brand is available, it will be returned with the resolved place&#39;s information, with <code>entity_id</code> changed to the brand&#39;s ID and subtype changed to <code>urn:entity:brand</code>.<br>--- If <code>both</code> is used, both the place and brand will be included, with their index properties pointing to the same value (using the same query).  <strong>Warnings</strong>:</p>
                                                                                                                    </li>
                                                                                                                    <li><p>If a place does not resolve, it will be included in <code>signal.interests.entities.query</code> warnings as <code>not_found</code>.</p>
                                                                                                                    </li>
                                                                                                                    <li><p>If a place resolves but a requested brand does not, the brand will be added to the warning <code>could_not_resolve_brand</code>.</p>
                                                                                                                    </li>
                                                                                                                    </ul>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                    </tr>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>signal.interests.tags</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Allows you to supply a list of tags to influence affinity scores. You can also include a<code>weight</code> property that will indicate the strength of influence for each tag in your list.  </p>
                                                                                                                    <ul>
                                                                                                                    <li>For <code>GET</code> requests: Provide a comma-separated list of tag IDs.</li></li>
                                                                                                                    <li>For <code>POST</code> requests, you can either:<br>  -- Send the same string of comma-separated values.<br>  -- Send an array of objects with &quot;tag&quot; and &quot;weight&quot; properties, such as:<br>      <code>[           { &quot;tag&quot;: &quot;urn:tag:genre:media:horror&quot;, &quot;weight&quot;: 7 },           { &quot;tag&quot;: &quot;urn:tag:genre:media:thriller&quot;, &quot;weight&quot;: 20 }         ]</code>  <br>
                                                                                                                    Weights must be greater than 0 and are relative. So, a weight of 20 means that tag will more heavily influence affinity scores than a weight of 7.</li>
                                                                                                                    </ul>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                    </tr>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>operator.signal.interests.tags</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Specifies how multiple <code>signal.interests.tags</code> values are combined in the query.  </p>
                                                                                                                    <ul>
                                                                                                                    <li>Use &quot;union&quot; (equivalent to a logical &quot;or&quot;) to return results that contain at least one of the specified tags. In this mode, the tag with the highest affinity is used for scoring. - Use &quot;intersection&quot; (equivalent to a logical &quot;and&quot;) or leave this field empty to return results that contain all specified tags, with affinity scores merged across them.</li>
                                                                                                                    </ul>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                    </tr>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>signal.location</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>The geolocation to use for geospatial results. The value will be a WKT POINT, POLYGON or a single Qloo ID for a named urn:entity:locality to filter by.  </p>
                                                                                                                    <p>WKT is formatted as X then Y, therefore longitude is first (POINT(-73.99823 40.722668)). Unlike <code>filter.location.radius</code>, <code>signal.location.radius</code> is ignored if a Qloo ID or WKT POLYGON is passed.</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                    </td>
                                                                                                                    </tr>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>signal.location.query</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>string</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>A string query used to search for a named urn:entity:locality Qloo ID for geospatial results, effectively equivalent to passing the same Locality Qloo ID into <code>signal.location</code>.  </p>
                                                                                                                    <p>Examples of locality queries include New York City, Garden City, New York, Los Angeles, Lower East Side, and AKAs like The Big Apple. These queries are &lt;<a href="glossary:fuzzy">glossary:fuzzy</a>&gt;-matched and case-insensitive.  </p>
                                                                                                                    <p>When <code>filter.location.query</code> is supplied, the response JSON will include <code>query.locality.signal</code>, which contains the partially matched Qloo entity. If no locality is found, the API will return a 400 error.</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                                                    </tr>
                                                                                                                    <tr>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p><code>signal.location.radius</code></p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>integer</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>The optional radius (in meters), used when providing a WKT POINT. We generally recommend avoiding this parameter, as it overrides dynamic density discovery.</p>
                                                                                                                    </td>
                                                                                                                      <td style="border: 1px solid #ddd; padding: 8px;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p>
                                                                                                                    </td>
                                                                                                                    </tr>
                                                                                                                    </tbody>
                                                                                                                    </table>
    `}</HTMLBlock>

  </Tab>

  <Tab title="Output">
    <HTMLBlock>{`
                                                                            <table>
                                                                              <thead>
                                                                                <tr>
                                                                                  <th style="text-align: left;">Parameter Name</th>
                                                                                  <th style="text-align: left;">Type</th>
                                                                                  <th style="text-align: left;">Description</th>
                                                                                  <th style="text-align: left;">Compatible Entity Types</th>
                                                                                </tr>
                                                                              </thead>
                                                                              <tbody>
                                                                                <tr>
                                                                                  <td style="text-align: left;"><code>diversify.by</code></td>
                                                                                  <td style="text-align: left;">string</td>
                                                                                  <td style="text-align: left;">
                                                                                    Limits results by a diversification field before paging. Existing values include <code>properties.geocode.city</code> and <code>properties.geocode.metro</code>. Use <code>subtype</code> with <code>filter.type=urn:tag</code> to cap results per tag subtype before paging, using <code>diversify.take</code> to set the limit.
                                                                                  </td>
                                                                                  <td style="text-align: left;"></td>
                                                                                </tr>
                                                                                <tr>
                                                                                  <td style="text-align: left;"><code>diversify.take</code></td>
                                                                                  <td style="text-align: left;">integer</td>
                                                                                  <td style="text-align: left;">
                                                                                    Sets the maximum number of results to return per city when using <code>diversify.by: "properties.geocode.city"</code>. For example, if set to 5, the response will include up to 5 entities with the highest affinities in each city.
                                                                                  </td>
                                                                                  <td style="text-align: left;"></td>
                                                                                </tr>
                                                                                <tr>
                                                                                  <td style="text-align: left;"><code>feature.explainability</code></td>
                                                                                  <td style="text-align: left;">boolean</td>
                                                                                  <td style="text-align: left;">
                                                                                    When set to <code>true</code>, the response includes explainability metadata for each recommendation and for the overall result set.<br><br>
                                                                                    <strong>Per-recommendation</strong>: Each result includes a <code>query.explainability</code> section showing which input entities (e.g. <code>signal.interests.entities</code>) contributed to the recommendation and by how much. Scores are normalized between 0–1. Entities with scores ≥ 0.1 are always included; those below may be omitted to reduce response size.<br><br>
                                                                                    <strong>Aggregate impact</strong>: The top-level <code>query.explainability</code> object shows average influence of each input entity across top-N result subsets (e.g. top 3, 5, 10, all).<br><br>
                                                                                    <strong>Note</strong>: If explainability cannot be computed for the request, a warning is included under <code>query.explainability.warning</code>, but results still return normally.
                                                                                  </td>
                                                                                  <td style="text-align: left;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                </tr>
                                                                                <tr>
                                                                                  <td style="text-align: left;"><code>offset</code></td>
                                                                                  <td style="text-align: left;">integer</td>
                                                                                  <td style="text-align: left;">
                                                                                    The number of results to skip, starting from 0. Allows arbitrary offsets but is less commonly used than <code>page</code>.
                                                                                  </td>
                                                                                  <td style="text-align: left;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                </tr>
                                                                                <tr>
                                                                                  <td style="text-align: left;"><code>heatmap.dimensions</code></td>
                                                                                  <td style="text-align: left;">array of strings</td>
                                                                                  <td style="text-align: left;">
                                                                                    Adds per-geohash place attributes as additional heatmap response columns. Accepted values are <code>quality</code>, <code>popularity</code>, <code>hotel_class</code>, and <code>price_level</code>. Each requested dimension adds <code>&lt;dim&gt;_affinity_rank</code> normalized from 0–1 and <code>&lt;dim&gt;_affinity</code> percent-rank values. Dimensions also influence the overall <code>query.affinity</code> ranking. Applies only when <code>filter.type=urn:heatmap</code> and <code>output.heatmap.boundary=urn:geohash</code>.
                                                                                  </td>
                                                                                  <td style="text-align: left;"><p>Heatmap</p></td>
                                                                                </tr>
                                                                                <tr>
                                                                                  <td style="text-align: left;"><code>output.heatmap.boundary</code></td>
                                                                                  <td style="text-align: left;">string</td>
                                                                                  <td style="text-align: left;">
                                                                                    Indicates the type of heatmap output desired: The default is geohashes. The other options are a city or a neighborhood.
                                                                                  </td>
                                                                                  <td style="text-align: left;"><p>Heatmap</p></td>
                                                                                </tr>
                                                                                <tr>
                                                                                  <td style="text-align: left;"><code>page</code></td>
                                                                                  <td style="text-align: left;">integer</td>
                                                                                  <td style="text-align: left;">
                                                                                    The page number of results to return. This is equivalent to take + offset and is the recommended approach for most use cases.
                                                                                  </td>
                                                                                  <td style="text-align: left;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                </tr>
                                                                                <tr>
                                                                                  <td style="text-align: left;"><code>sort_by</code></td>
                                                                                  <td style="text-align: left;">string</td>
                                                                                  <td style="text-align: left;">
                                                                                    This parameter modifies the results sorting algorithm. Existing values include <code>affinity</code>, <code>distance</code>, and <code>rating</code>. Use <code>quality</code> to order place results by quality score, highest first. When <code>sort_by=quality</code> is used, only places with a quality score are returned and <code>filter.type</code> must be <code>urn:entity:place</code>.
                                                                                  </td>
                                                                                  <td style="text-align: left;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                </tr>
                                                                                <tr>
                                                                                  <td style="text-align: left;"><code>take</code></td>
                                                                                  <td style="text-align: left;">integer</td>
                                                                                 <td style="text-align: left;">
                      <p>The number of results to return. Default is <code>20</code>. The maximum allowed is <code>50</code>.</p>
                      <p>To retrieve additional results, use the <code>page</code> parameter to access the next page of results. This is the recommended approach for pagination.</p>
                      <p>For specific cases, the <code>offset</code> parameter can be used with <code>take</code> to skip a set number of results.</p>
                    </td>
                                                                                  <td style="text-align: left;"><p>Artist, Book, Brand, Destination, Movie, Person, Place, Podcast, TV Show, Video Game</p></td>
                                                                                </tr>
                                                                              </tbody>
                                                                            </table>
    `}</HTMLBlock>
  </Tab>
</Tabs>
