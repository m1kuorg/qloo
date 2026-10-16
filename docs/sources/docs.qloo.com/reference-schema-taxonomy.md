---
updatedAt: 2026-08-27T17:18:18.000Z
---

# Schema & Taxonomy

<br />

<Tabs>
  <Tab title="Books">
    # Books

    The Books entity type covers published written works across all formats: literary fiction, nonfiction, biography, history, genre fiction, and more. Entities represent individual editions or titles.

    ### Common Use Cases

    - Content recommendation (e.g., "readers who liked X will enjoy Y")
    - Audience affinity analysis based on reading preferences
    - Enriching user profiles with book-taste signals

    ### Taxonomy

    <Callout icon="📘" theme="info">
      ### Taxonomy Structure

      Tags are flat, a single entity may carry multiple genre tags simultaneously (e.g., a book tagged both true_crime and biography). There is no strict parent-child hierarchy within book genres; the tags are additive descriptors.
    </Callout>

    | Tag name           | URN                                      |
    | ------------------ | ---------------------------------------- |
    | Action             | `urn:tag:genre:media:action`             |
    | Adult              | `urn:tag:genre:media:adult`              |
    | American History   | `urn:tag:genre:media:american_history`   |
    | Audiobook          | `urn:tag:genre:media:audiobook`          |
    | Banned Books       | `urn:tag:genre:media:banned_books`       |
    | Biography          | `urn:tag:genre:media:biography`          |
    | Biography Memoir   | `urn:tag:genre:media:biography_memoir`   |
    | Business           | `urn:tag:genre:media:business`           |
    | Childrens          | `urn:tag:genre:media:childrens`          |
    | Classic Literature | `urn:tag:genre:media:classic_literature` |
    | Classics           | `urn:tag:genre:media:classics`           |
    | Coming of Age      | `urn:tag:genre:media:coming_age`         |
    | Crime              | `urn:tag:genre:media:crime`              |
    | Drama              | `urn:tag:genre:media:drama`              |
    | Dystopia           | `urn:tag:genre:media:dystopia`           |
    | Fantasy            | `urn:tag:genre:media:fantasy`            |
    | Fiction            | `urn:tag:genre:media:fiction`            |
    | Finance            | `urn:tag:genre:media:finance`            |
    | High School        | `urn:tag:genre:media:high_school`        |
    | Historical         | `urn:tag:genre:media:historical`         |
    | Historical Fiction | `urn:tag:genre:media:historical_fiction` |
    | History            | `urn:tag:genre:media:history`            |
    | Law                | `urn:tag:genre:media:law`                |
    | Literary Fiction   | `urn:tag:genre:media:literary_fiction`   |
    | Medical            | `urn:tag:genre:media:medical`            |
    | Memoir             | `urn:tag:genre:media:memoir`             |
    | Military History   | `urn:tag:genre:media:military_history`   |
    | Mystery            | `urn:tag:genre:media:mystery`            |
    | Nonfiction         | `urn:tag:genre:media:nonfiction`         |
    | Novels             | `urn:tag:genre:media:novels`             |
    | Philosophy         | `urn:tag:genre:media:philosophy`         |
    | Politics           | `urn:tag:genre:media:politics`           |
    | Psychology         | `urn:tag:genre:media:psychology`         |
    | Read for School    | `urn:tag:genre:media:read_school`        |
    | Romance            | `urn:tag:genre:media:romance`            |
    | School             | `urn:tag:genre:media:school`             |
    | Science            | `urn:tag:genre:media:science`            |
    | Sociology          | `urn:tag:genre:media:sociology`          |
    | Sports             | `urn:tag:genre:media:sports`             |
    | Theatre            | `urn:tag:genre:media:theatre`            |
    | True Crime         | `urn:tag:genre:media:true_crime`         |
    | True Story         | `urn:tag:genre:media:true_story`         |
    | War                | `urn:tag:genre:media:war`                |
    | Young Adult        | `urn:tag:genre:media:young_adult`        |

    ### Schema Reference

    | Field                   | Type              | Description                                                        | Nullable |
    | ----------------------- | ----------------- | ------------------------------------------------------------------ | -------- |
    | success                 | boolean           | Indicates whether the request returned valid results               | No       |
    | entity_id               | string (UUID)     | Unique identifier for the entity                                   | No       |
    | type                    | string            | Always "urn:entity" for book entities                              | No       |
    | subtype                 | string            | Always "urn:entity:book"                                           | No       |
    | name                    | string            | Full title of the book                                             | No       |
    | title                   | string            | Full title (mirrors name)                                          | No       |
    | description             | string            | Long-form description or back-cover synopsis                       | Yes      |
    | short_description       | string            | One- to two-sentence summary                                       | Yes      |
    | author / disambiguation | string            | Author name and year, formatted as "YYYY, author_name"             | Yes      |
    | format                  | string            | Physical format (e.g., "hardcover", "paperback", "kindle_edition") | Yes      |
    | language                | string            | Language of publication                                            | Yes      |
    | page_count              | integer           | Total number of pages                                              | Yes      |
    | publication_date        | string (ISO date) | Full publication date                                              | Yes      |
    | publication_year        | integer           | Year of publication                                                | Yes      |
    | publisher               | string            | Publisher name                                                     | Yes      |
    | isbn10                  | string            | 10-digit ISBN                                                      | Yes      |
    | isbn13                  | string            | 13-digit ISBN                                                      | Yes      |
    | series_name             | string            | Series name, if part of a series                                   | Yes      |
    | url                     | string (URL)      | Qloo image URL for the entity                                      | Yes      |
    | popularity              | float (0–1)       | Normalized popularity score                                        | No       |
    | affinity                | float (0–1)       | Affinity score relative to the input entity                        | No       |
    | tags                    | array of objects  | Genre classification tags (see Taxonomy)                           | Yes      |
    | tags\[].id              | string (URN)      | Tag URN identifier                                                 | No       |
    | tags\[].name            | string            | Human-readable tag name                                            | No       |
    | tags\[].type            | string            | Always "urn:tag:genre:media" for book genre tags                   | No       |

    ### Canonical JSON Example

    Example request: Books, in-domain, input entity _The Great Gatsby_. Example response entity: _The Catcher in the Rye_ (highest data completeness in the result set, popularity: 0.9998).

    ```json
    {
      "success": true,
      "entity_id": "A2DEF825-7285-40C8-A39F-1E9BC86E6F6E",
      "type": "urn:entity",
      "subtype": "urn:entity:book",
      "name": "The Catcher in the Rye",
      "title": "The Catcher in the Rye",
      "description": "It's Christmas time and Holden Caulfield has just been expelled from yet another school...",
      "short_description": "Holden Caulfield, expelled from school, wanders New York City, grappling with alienation and a desire to protect innocence.",
      "format": "Paperback",
      "isbn13": "9780316769174",
      "language": "English",
      "page_count": 234,
      "publication_date": "1951-07-16",
      "publication_year": 1951,
      "publisher": "Back Bay Books",
      "url": "https://images.qloo.com/i/A2DEF825-7285-40C8-A39F-1E9BC86E6F6E-420x-auto.jpg",
      "popularity": 0.9997517986100722,
      "affinity": 0.9631669272078096,
      "disambiguation": "1951, J.D. Salinger",
      "tags": [
        { "id": "urn:tag:genre:media:classics", "name": "Classics", "type": "urn:tag:genre:media" },
        { "id": "urn:tag:genre:media:young_adult", "name": "Young Adult", "type": "urn:tag:genre:media" },
        { "id": "urn:tag:genre:media:banned_books", "name": "Banned Books", "type": "urn:tag:genre:media" },
        { "id": "urn:tag:genre:media:high_school", "name": "High School", "type": "urn:tag:genre:media" }
      ]
    }
    ```

    ### Cross-Domain Comparison

    Input entity: `target` (retail brand), queried across all entity types.

    **Cross-Domain Results (Books, Input: Target)**

    | Title                 | Top genres                             | Affinity |
    | --------------------- | -------------------------------------- | -------- |
    | _Killing the Legends_ | History, Biography Memoir, Nonfiction  | 0.900    |
    | _A Convenient Death_  | Biography, Nonfiction, Crime, Politics | 0.881    |
    | _Killing the Mob_     | True Crime, Crime, Biography           | 0.876    |
    | _Imperfect Justice_   | True Crime, Biography, Law             | 0.873    |
    | _Tiger Woods_         | Sports, Memoir, True Story             | 0.854    |

    Results skew toward True Crime, Biography, and Nonfiction. No fiction titles appear in the top results.

    **In-Domain Results (Books, Input: The Great Gatsby)**

    | Title                             | Top genres                           | Affinity |
    | --------------------------------- | ------------------------------------ | -------- |
    | _The Catcher in the Rye_          | Classics, Young Adult, Banned Books  | 0.963    |
    | _Of Mice and Men_                 | School, American, Historical Fiction | 0.960    |
    | _Lord of the Flies_               | School, Fiction, Dystopia            | 0.930    |
    | _One Flew Over the Cuckoo's Nest_ | Psychology, Literary Fiction         | 0.929    |
    | _The Grapes of Wrath_             | School, American, Classic Literature | 0.924    |

    A broad commercial input (Target) surfaces mainstream nonfiction, biography, and true crime. A literary fiction input (_The Great Gatsby_) surfaces literary classics and school-curriculum titles. Affinity results reflect the taste profile implied by the input entity, not topical similarity to the input's subject matter.

  </Tab>

  <Tab title="Brands">
    The Brands entity type covers commercial entities: companies, products, retailers, sports organizations, media platforms, and more. It is one of the most schema-rich entity types, with detailed fields for industry, audience, sustainability initiatives, business model, and brand personality.

    ### Common Use Cases

    - Brand affinity and audience overlap analysis
    - Competitive intelligence and positioning
    - Enriching user profiles with brand-preference signals

    ### Taxonomy

    <Callout icon="🏷️" theme="info">
      ### Taxonomy Structure

      Brand entities are classified using a hierarchical `urn:tag:genre:brand` taxonomy, moving from broad category to specific subcategory (e.g., Fashion → Footwear → Sneakers → Basketball). Brands may also carry `urn:tag:adjective:qloo` tags describing brand personality (e.g., innovative, luxurious, athletic, classic), and `urn:tag:wikipedia_category:wikidata` tags linking to structured encyclopedic classification.
    </Callout>

    **Top-Level Categories (Examples)**

    | Tag name            | URN                                       |
    | ------------------- | ----------------------------------------- |
    | Automotive          | `urn:tag:genre:brand:automotive`          |
    | Electronics         | `urn:tag:genre:brand:electronics`         |
    | Entertainment       | `urn:tag:genre:brand:entertainment`       |
    | Fashion             | `urn:tag:genre:brand:fashion`             |
    | Food & Beverage     | `urn:tag:genre:brand:food_and_beverage`   |
    | Games               | `urn:tag:genre:brand:games`               |
    | Health & Beauty     | `urn:tag:genre:brand:health_and_beauty`   |
    | Mobile App          | `urn:tag:genre:brand:mobile_app`          |
    | Retail              | `urn:tag:genre:brand:retail`              |
    | Software            | `urn:tag:genre:brand:software`            |
    | Sports Organization | `urn:tag:genre:brand:sports_organization` |
    | Website             | `urn:tag:genre:brand:website`             |
    | Wine & Spirits      | `urn:tag:genre:brand:wine_and_spirits`    |

    **Selected Subcategories (Examples)**

    | Tag name              | URN                                                       |
    | --------------------- | --------------------------------------------------------- |
    | Car & SUV             | `urn:tag:genre:brand:automotive:car_and_suv`              |
    | Electric (Vehicle)    | `urn:tag:genre:brand:automotive:electric`                 |
    | Gaming (Electronics)  | `urn:tag:genre:brand:electronics:gaming`                  |
    | Headphones            | `urn:tag:genre:brand:electronics:headphones`              |
    | Phones & Tablets      | `urn:tag:genre:brand:electronics:phones_and_tablets`      |
    | Production Company    | `urn:tag:genre:brand:entertainment:production_company`    |
    | Streaming Service App | `urn:tag:genre:brand:mobile_app:streaming_service`        |
    | Social Networking App | `urn:tag:genre:brand:mobile_app:social_networking`        |
    | Footwear              | `urn:tag:genre:brand:fashion:footwear`                    |
    | Sneakers              | `urn:tag:genre:brand:fashion:footwear:sneakers`           |
    | Sneakers: Basketball  | `urn:tag:genre:brand:fashion:footwear:sneaker:basketball` |
    | Sneakers: Running     | `urn:tag:genre:brand:fashion:footwear:sneaker:running`    |
    | Jeans                 | `urn:tag:genre:brand:fashion:jeans`                       |
    | Soccer                | `urn:tag:genre:brand:sports_organization:soccer`          |
    | Basketball            | `urn:tag:genre:brand:sports_organization:basketball`      |
    | NBA                   | `urn:tag:genre:brand:sports_organization:basketball:nba`  |

    ### Schema Reference

    | Field                      | Type              | Description                                             | Nullable |
    | -------------------------- | ----------------- | ------------------------------------------------------- | -------- |
    | entity_id                  | string (UUID)     | Unique identifier                                       | No       |
    | type                       | string            | Always "urn:entity"                                     | No       |
    | subtype                    | string            | Always "urn:entity:brand"                               | No       |
    | name                       | string            | Brand name                                              | No       |
    | description                | string            | Long-form brand overview                                | Yes      |
    | url                        | string (URL)      | Qloo image URL                                          | Yes      |
    | official_site              | string (URL)      | Brand's official website                                | Yes      |
    | founded_year               | integer           | Year founded                                            | Yes      |
    | inception                  | string (ISO date) | Precise founding date                                   | Yes      |
    | headquartered              | string            | City of headquarters                                    | Yes      |
    | headquarters_address       | string            | Full headquarters address                               | Yes      |
    | direct_owner               | string            | Direct owning entity                                    | Yes      |
    | parent_company             | string            | Ultimate parent company                                 | Yes      |
    | owned_by                   | string            | Alternative ownership field                             | Yes      |
    | industries                 | array of strings  | Industry classifications                                | Yes      |
    | products                   | array of strings  | Key products or product lines                           | Yes      |
    | subsidiaries               | array of strings  | Known subsidiaries                                      | Yes      |
    | brand_type                 | array of strings  | e.g., "corporate_brand", "product_brand", "media_brand" | Yes      |
    | industry_categories        | array of strings  | Detailed industry categories                            | Yes      |
    | core_values                | array of strings  | Brand values (e.g., "innovation", "quality")            | Yes      |
    | brand_personality          | array of strings  | Adjective descriptors                                   | Yes      |
    | brand_adjectives           | array of strings  | Additional style/tone descriptors                       | Yes      |
    | lifestyles                 | array of strings  | Consumer lifestyle associations                         | Yes      |
    | use_occasions              | array of strings  | Occasions/contexts of use                               | Yes      |
    | target_audience            | array of strings  | Primary audience descriptors                            | Yes      |
    | psychographic_segments     | array of strings  | Psychographic audience segments                         | Yes      |
    | customer_personas          | array of strings  | Detailed customer persona types                         | Yes      |
    | key_influencer_types       | array of strings  | Types of influencers associated with brand              | Yes      |
    | aspirational_outcomes      | array of strings  | Goals/outcomes the brand is associated with             | Yes      |
    | celebrity_spokesperson     | array of strings  | Associated celebrity spokespeople                       | Yes      |
    | price_tier                 | array of strings  | e.g., "low_end", "medium_end", "high_end"               | Yes      |
    | business_model             | array of strings  | e.g., "b2c", "b2b", "subscription", "marketplace"       | Yes      |
    | target_markets             | array of strings  | Countries/regions served                                | Yes      |
    | fashion_style              | array of strings  | Style associations (Fashion brands)                     | Yes      |
    | competitive_set            | array of strings  | Direct competitors                                      | Yes      |
    | complementary_brands       | array of strings  | Complementary/adjacent brands                           | Yes      |
    | sustainability_initiatives | array of strings  | ESG/sustainability programs                             | Yes      |
    | audience_growth            | float             | Audience growth signal                                  | Yes      |
    | popularity                 | float (0–1)       | Normalized popularity score                             | No       |
    | affinity                   | float (0–1)       | Affinity score relative to input                        | No       |
    | disambiguation             | string            | Disambiguation note (often empty for brands)            | Yes      |
    | tags                       | array of objects  | Genre/adjective/Wikipedia classification tags           | Yes      |

    ### Canonical JSON Example

    Example request: Brands, in-domain, input entity Nike. Example response entity: Air Jordan Product Line (affinity: 0.970, most complete metadata in the result set).

    ```json
    {
      "entity_id": "E26BC58D-18D2-405B-BC7B-7C556ADE3829",
      "type": "urn:entity",
      "subtype": "urn:entity:brand",
      "name": "Air Jordan Product Line",
      "description": "Air Jordan is Nike's flagship basketball and lifestyle product line launched in the mid-1980s around Michael Jordan. It includes performance basketball shoes, lifestyle sneakers, apparel and accessories that blend on-court technology with streetwear aesthetics. The line is known for its signature silhouettes, frequent retro reissues, high-profile collaborations and limited drops that drive collector culture and resale demand.",
      "url": "https://images.qloo.com/i/E26BC58D-18D2-405B-BC7B-7C556ADE3829-420x-auto.jpg",
      "founded_year": 1984,
      "direct_owner": "Jordan Brand",
      "parent_company": "Nike, Inc.",
      "price_tier": ["high-end"],
      "brand_type": ["Product Brand"],
      "industry_categories": ["Sports Fitness", "Apparel", "Retail", "Fashion", "Footwear", "Athleisure", "Streetwear"],
      "core_values": ["Performance", "Heritage", "Innovation", "Authenticity", "Excellence", "Exclusivity", "Quality"],
      "brand_personality": ["iconic", "athletic", "heritage", "streetwear", "premium", "performance", "collectible", "nostalgic"],
      "target_audience": ["young adults"],
      "psychographic_segments": ["sneakerheads", "basketball players", "streetwear enthusiasts", "collectors", "style-conscious consumers"],
      "use_occasions": ["basketball courts", "sneaker collecting", "urban streetwear culture", "casual athleisure", "concerts and events"],
      "aspirational_outcomes": ["owning a curated sneaker collection", "achieving on-court credibility", "attaining cultural cachet and style recognition"],
      "celebrity_spokesperson": ["Michael Jordan"],
      "business_model": ["B2C", "B2B", "Licensing"],
      "target_markets": ["United States", "China", "United Kingdom", "Japan", "Germany"],
      "competitive_set": ["Adidas", "Puma", "New Balance", "Under Armour", "Reebok"],
      "complementary_brands": ["Adidas Originals", "Yeezy", "Converse", "Vans", "Nike SB"],
      "sustainability_initiatives": ["Move To Zero (Nike climate initiative)", "Recycled Materials", "Eco-Friendly Packaging", "Supply Chain Transparency"],
      "popularity": 0.9990167991727552,
      "affinity": 0.969972417154696,
      "audience_growth": 0,
      "tags": [
        { "id": "urn:tag:genre:brand:fashion:footwear:sneaker:basketball", "name": "Basketball", "type": "urn:tag:genre:brand" },
        { "id": "urn:tag:genre:brand:fashion", "name": "Fashion", "type": "urn:tag:genre:brand" },
        { "id": "urn:tag:genre:brand:fashion:footwear", "name": "Footwear", "type": "urn:tag:genre:brand" },
        { "id": "urn:tag:genre:brand:fashion:footwear:sneakers", "name": "Sneakers", "type": "urn:tag:genre:brand" }
      ]
    }
    ```

    ### Cross-Domain Comparison

    Input entity: `harry_potter_and_the_sorcerers_stone` (book), queried against the Brands entity type. Target, used as the standard cross-domain input elsewhere in this reference, is the in-domain input here since it's itself a brand.

    **Cross-Domain Results (Brands, Input: Harry Potter and the Sorcerer's Stone)**

    | Brand                           | Category                         | Affinity |
    | ------------------------------- | -------------------------------- | -------- |
    | Air Jordan                      | Fashion / Footwear               | 0.970    |
    | Real Madrid CF                  | Sports Organization / Soccer     | 0.969    |
    | National Basketball Association | Sports Organization / Basketball | 0.965    |
    | Adidas                          | Fashion / Footwear               | 0.964    |
    | Beats Electronics               | Consumer Electronics / Audio     | 0.961    |
    | FC Barcelona                    | Sports Organization / Soccer     | 0.962    |

    Results skew toward gaming, entertainment, and tech brands associated with imaginative, fan-driven audiences.

    **In-Domain Results (Brands, Input: Target)**

    | Brand       | Category                             | Affinity |
    | ----------- | ------------------------------------ | -------- |
    | Apple Inc.  | Technology / Consumer Electronics    | 0.949    |
    | Sony        | Consumer Electronics / Entertainment | 0.931    |
    | PlayStation | Gaming / Consumer Electronics        | 0.925    |
    | Xbox        | Gaming / Consumer Electronics        | 0.917    |
    | Lamborghini | Automotive / Luxury                  | 0.914    |
    | YouTube     | Digital Media / Streaming            | 0.910    |
    | Tesla       | Automotive / EV                      | 0.909    |
    | Porsche     | Automotive / Luxury                  | 0.906    |

    A fictional media property (Harry Potter) surfaces sports, lifestyle, and culture brands with strong fan communities. A mass-market retailer (Target) surfaces premium, everyday consumer brands, technology, gaming, and automotive results. The same entity type returns different taste neighborhoods depending on which cultural entity anchors the query.

  </Tab>

  <Tab title="Localities">
    # Localities

    The Localities entity type covers geographic areas at multiple administrative levels: neighborhoods, cities, suburbs, counties, states, and countries. Entities represent real-world places defined by their geographic boundaries and characteristics rather than individual businesses or venues.

    ### Common Use Cases

    - Location-aware recommendations (e.g., identifying nearby or comparable neighborhoods based on shared characteristics)
    - Travel and destination discovery
    - Geographic context enrichment for cross-entity-type queries (e.g., using a location as a signal to improve movie or restaurant recommendations for users in a given area)

    ### Taxonomy

    <Callout icon="🗺️" theme="info">
      ### Taxonomy Structure

      Locality entities are classified using `urn:tag:genre:locality` tags describing administrative level. Additional enrichment tags appear across 59 distinct tag categories covering language, climate, monthly events, and travel advisories, among others. Enrichment tags are not present on every entity, they appear where sufficient data exists to characterize the locality beyond its basic geographic type. Monthly Event, Monthly Event Type, and Monthly Travel Advisory tags each have a separate URN per month (e.g., `urn:tag:june_event:qloo`, `urn:tag:june_event_type:qloo`, `urn:tag:june_travel_advisory:qloo`); replace `{month}` with the lowercase month name to construct the full URN for any given month.
    </Callout>

    **Locality Tags**

    | Tag name      | URN                                    |
    | ------------- | -------------------------------------- |
    | Neighbourhood | `urn:tag:genre:locality:neighbourhood` |
    | Suburb        | `urn:tag:genre:locality:suburb`        |
    | City          | `urn:tag:genre:locality:city`          |

    **Enrichment Tags**

    | Tag name                   | URN                                       |
    | -------------------------- | ----------------------------------------- |
    | Activity                   | `urn:tag:activity:qloo`                   |
    | Best Month for Travel      | `urn:tag:best_month_for_travel:qloo`      |
    | Characteristic             | `urn:tag:characteristic:qloo`             |
    | Climate                    | `urn:tag:climate:qloo`                    |
    | Culinary Experience        | `urn:tag:culinary_experience:qloo`        |
    | Culture                    | `urn:tag:culture:qloo`                    |
    | Demographic Characteristic | `urn:tag:demographic_characteristic:qloo` |
    | Entertainment Option       | `urn:tag:entertainment_option:qloo`       |
    | Fauna                      | `urn:tag:fauna:qloo`                      |
    | Flora                      | `urn:tag:flora:qloo`                      |
    | Ideal Traveler             | `urn:tag:ideal_traveler:qloo`             |
    | Language                   | `urn:tag:language:qloo`                   |
    | Monthly Event              | `urn:tag:{month}_event:qloo`              |
    | Monthly Event Type         | `urn:tag:{month}_event_type:qloo`         |
    | Monthly Travel Advisory    | `urn:tag:{month}_travel_advisory:qloo`    |
    | Off Season Month           | `urn:tag:off_season_month:qloo`           |
    | Peak Tourism Month         | `urn:tag:peak_tourism_month:qloo`         |
    | Photogenic Spot            | `urn:tag:photogenic_spot:qloo`            |
    | Popular Food Item          | `urn:tag:popular_food_item:qloo`          |
    | Related Celebrity          | `urn:tag:related_celebrity:qloo`          |
    | Scenery                    | `urn:tag:scenery:qloo`                    |
    | Shopping                   | `urn:tag:shopping:qloo`                   |
    | Transport                  | `urn:tag:transport:qloo`                  |
    | Unusual Attraction         | `urn:tag:unusual_attraction:qloo`         |
    | Worst Month for Travel     | `urn:tag:worst_month_for_travel:qloo`     |

    ### Schema Reference

    | Field          | Type             | Description                                                                                                         | Required |
    | -------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------- | -------- |
    | success        | boolean          | Indicates whether the request returned valid results                                                                | Yes      |
    | entity_id      | string (UUID)    | Unique identifier for the entity                                                                                    | Yes      |
    | type           | string           | Always "urn:entity"                                                                                                 | Yes      |
    | subtype        | string           | Always "urn:entity:locality"                                                                                        | Yes      |
    | name           | string           | Name of the locality                                                                                                | Yes      |
    | place          | string           | Administrative place type (e.g., "neighbourhood", "suburb", "city")                                                 | Yes      |
    | admin_level    | integer          | Numeric administrative level; lower numbers indicate larger geographic areas, higher numbers indicate smaller areas | Yes      |
    | lat            | float            | Latitude coordinate of the locality centroid                                                                        | Yes      |
    | lon            | float            | Longitude coordinate of the locality centroid                                                                       | Yes      |
    | geohash        | string           | Geohash encoding of the locality's coordinates                                                                      | Yes      |
    | population     | integer          | Population of the locality                                                                                          | No       |
    | website        | string (URL)     | Official website, if available                                                                                      | No       |
    | popularity     | float (0–1)      | Normalized popularity score                                                                                         | No       |
    | affinity       | float (0–1)      | Affinity score relative to the input entity                                                                         | Yes      |
    | disambiguation | string           | Full geographic path for disambiguation (e.g., "midtown_east", "manhattan", "new_york", "united_states_of_america") | Yes      |
    | tags           | array of objects | Locality type and enrichment tags                                                                                   | No       |
    | tags\[].id     | string (URN)     | Tag URN identifier                                                                                                  | Yes      |
    | tags\[].name   | string           | Human-readable tag name                                                                                             | Yes      |
    | tags\[].type   | string           | Tag namespace (e.g., "urn:tag:genre:locality", "urn:tag:language:qloo")                                             | Yes      |

    <Callout icon="📏" theme="info">
      The `admin_level` field uses a numeric scale to indicate geographic granularity. Lower values represent broader areas (city = level 5, suburb = level 7); higher values represent more granular areas (neighbourhood = level 10).
    </Callout>

    ### Canonical JSON Example

    Example request: Localities, in-domain, input entity Midtown Manhattan. Example response entity: New York City (most data-rich result, with the widest range of enrichment tags and a popularity score).

    ```json
    {
      "success": true,
      "entity_id": "81E61924-6CEE-4AB4-93D3-282A5C784AB8",
      "type": "urn:entity",
      "subtype": "urn:entity:locality",
      "name": "New York City",
      "place": "city",
      "admin_level": 5,
      "population": 8467513,
      "website": "https://www.nyc.gov",
      "lat": 40.66320611815103,
      "lon": -73.93889084762313,
      "geohash": "dr5rm6x26gnb",
      "popularity": 0.9995855781185247,
      "affinity": 0.9908225076152646,
      "disambiguation": "New York, New York, United States of America",
      "tags": [
        { "id": "urn:tag:flora:qloo:lawn_lawns", "name": "Lawn Lawns", "type": "urn:tag:flora:qloo" },
        { "id": "urn:tag:may_event:qloo:fleet_week", "name": "Fleet Week", "type": "urn:tag:may_event:qloo" },
        { "id": "urn:tag:fauna:qloo:raccoon", "name": "Raccoon", "type": "urn:tag:fauna:qloo" },
        { "id": "urn:tag:language:qloo:english", "name": "English", "type": "urn:tag:language:qloo" }
      ]
    }
    ```

    ### In-Domain Results

    Input entity: `midtown_manhattan`. Results represent localities a user who frequents Midtown Manhattan is likely to also engage with.

    | Locality             | Place Type    | Admin Level | Affinity |
    | -------------------- | ------------- | ----------- | -------- |
    | Midtown East         | Neighbourhood | 10          | 0.997    |
    | Manhattan            | Suburb        | 7           | 0.993    |
    | Midtown South        | Neighbourhood | 10          | 0.993    |
    | Herald Square        | Neighbourhood | 10          | 0.992    |
    | Flatiron District    | Neighbourhood | 10          | 0.992    |
    | Hudson Yards         | Neighbourhood | 10          | 0.991    |
    | Murray Hill          | Neighbourhood | 10          | 0.991    |
    | New York City        | City          | 5           | 0.991    |
    | Meatpacking District | Neighbourhood | 10          | 0.990    |
    | Chelsea              | Neighbourhood | 10          | 0.990    |
    | SoHo                 | Neighbourhood | 10          | 0.990    |
    | West Village         | Neighbourhood | 10          | 0.989    |
    | Financial District   | Neighbourhood | 10          | 0.989    |
    | Theater District     | Neighbourhood | 10          | 0.989    |
    | Hell's Kitchen       | Neighbourhood | 10          | 0.987    |
    | Greenwich Village    | Neighbourhood | 10          | 0.986    |
    | Little Italy         | Neighbourhood | 10          | 0.986    |
    | Garment District     | Neighbourhood | 10          | 0.986    |
    | Koreatown            | Neighbourhood | 10          | 0.985    |

    <Callout icon="ℹ️" theme="info">
      The Localities entity type is in-domain only. Cross-domain queries are not applicable for this entity type. Localities can be passed as a location signal to enrich recommendations across other entity types.
    </Callout>

  </Tab>

  <Tab title="Movies">
    # Movies

    The Movies entity type covers theatrical and streaming film releases across all genres and eras. Entities include international films, franchises, and animated features.

    ### Common Use Cases

    - Film recommendation systems
    - Audience segmentation by genre preference
    - Cultural intelligence for content licensing and programming decisions

    ### Taxonomy

    <Callout icon="🎬" theme="info">
      ### Taxonomy Structure

      Movies share the `urn:tag:genre:media` namespace with Books, plus movie-specific keyword tags under `urn:tag:keyword:media` (e.g., `based_on_novel`, `superhero_action`, `drug_cartel`, `sequel`, `remake`, `surprise_ending`) for granular thematic signals used in fine-grained content matching.
    </Callout>

    | Tag name    | URN                               |
    | ----------- | --------------------------------- |
    | Action      | `urn:tag:genre:media:action`      |
    | Adventure   | `urn:tag:genre:media:adventure`   |
    | Animation   | `urn:tag:genre:media:animation`   |
    | Biography   | `urn:tag:genre:media:biography`   |
    | Comedy      | `urn:tag:genre:media:comedy`      |
    | Crime       | `urn:tag:genre:media:crime`       |
    | Documentary | `urn:tag:genre:media:documentary` |
    | Drama       | `urn:tag:genre:media:drama`       |
    | Fantasy     | `urn:tag:genre:media:fantasy`     |
    | Historical  | `urn:tag:genre:media:historical`  |
    | Horror      | `urn:tag:genre:media:horror`      |
    | Musical     | `urn:tag:genre:media:musical`     |
    | Mystery     | `urn:tag:genre:media:mystery`     |
    | Romance     | `urn:tag:genre:media:romance`     |
    | Sci-Fi      | `urn:tag:genre:media:sci_fi`      |
    | Thriller    | `urn:tag:genre:media:thriller`    |
    | War         | `urn:tag:genre:media:war`         |

    ### Schema Reference

    | Field                | Type                    | Description                                          | Nullable |
    | -------------------- | ----------------------- | ---------------------------------------------------- | -------- |
    | entity_id            | string (UUID)           | Unique identifier                                    | No       |
    | type                 | string                  | Always "urn:entity"                                  | No       |
    | subtype              | string                  | Always "urn:entity:movie"                            | No       |
    | name                 | string                  | Film title                                           | No       |
    | description          | string                  | Plot synopsis                                        | Yes      |
    | short_description    | string                  | One-sentence plot summary                            | Yes      |
    | url                  | string (URL)            | Qloo image URL                                       | Yes      |
    | release_date         | string (ISO date)       | Theatrical release date                              | Yes      |
    | release_year         | integer                 | Year of release                                      | Yes      |
    | duration             | integer                 | Runtime in minutes                                   | Yes      |
    | content_rating       | string                  | MPAA or equivalent rating (e.g., "pg", "r", "tv_ma") | Yes      |
    | filming_location     | string                  | Primary filming location                             | Yes      |
    | production_companies | array of strings        | Production company names                             | Yes      |
    | country_of_origin    | array of strings        | Countries of origin                                  | Yes      |
    | external_links       | array of strings (URLs) | Official site, streaming links                       | Yes      |
    | popularity           | float (0–1)             | Normalized popularity score                          | No       |
    | affinity             | float (0–1)             | Affinity score relative to input                     | No       |
    | audience_growth      | float                   | Audience growth signal                               | Yes      |
    | disambiguation       | string                  | Release year for disambiguation                      | Yes      |
    | tags                 | array of objects        | Genre and keyword tags                               | Yes      |

    ### Canonical JSON Example

    Example request: Movies, in-domain, input entity _The Dark Knight_. Example response entity: _Inception_ (highest-affinity non-_Dark Knight_ result with the richest metadata, popularity: 0.9999).

    ```json
    {
      "entity_id": "18B098FD-3D84-4609-BFF3-ADF9A0B00E40",
      "type": "urn:entity",
      "subtype": "urn:entity:movie",
      "name": "Inception",
      "description": "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O., but his tragic past may doom the project and his team to disaster.",
      "short_description": "A skilled thief uses dream-sharing technology to implant an idea into a CEO's mind while confronting his troubled past.",
      "url": "https://images.qloo.com/i/18B098FD-3D84-4609-BFF3-ADF9A0B00E40-420x-auto.jpg",
      "release_date": "2010-07-16",
      "release_year": 2010,
      "duration": 148,
      "content_rating": "PG-13",
      "filming_location": "Fortress Mountain, Kananaskis Country, Alberta, Canada",
      "production_companies": ["Warner Bros.", "Syncopy", "Legendary Entertainment"],
      "country_of_origin": ["United States", "United Kingdom"],
      "external_links": [
        "http://wwws.warnerbros.co.jp/inception/",
        "http://inceptionmovie.warnerbros.com/"
      ],
      "popularity": 0.9999707067008422,
      "affinity": 0.9032564835891777,
      "audience_growth": 0.7071067811865474,
      "disambiguation": "2010",
      "tags": [
        { "id": "urn:tag:genre:media:action", "name": "Action", "type": "urn:tag:genre:media" },
        { "id": "urn:tag:keyword:media:falling_from_height", "name": "falling from height", "type": "urn:tag:keyword:media" },
        { "id": "urn:tag:keyword:media:guilt", "name": "guilt", "type": "urn:tag:keyword:media" },
        { "id": "urn:tag:keyword:media:kidnapping", "name": "kidnapping", "type": "urn:tag:keyword:media" }
      ]
    }
    ```

    ### Cross-Domain Comparison

    Input entity: `target`, queried across all entity types.

    **Cross-Domain Results (Movies, Input: Target)**

    | Title                       | Year | Affinity |
    | --------------------------- | ---- | -------- |
    | _Aladdin_                   | 2019 | 0.949    |
    | _Frozen II_                 | 2019 | 0.946    |
    | _Ralph Breaks the Internet_ | 2018 | 0.945    |
    | _Toy Story 4_               | 2019 | 0.942    |
    | _The Secret Life of Pets 2_ | 2019 | 0.939    |
    | _The Grinch_                | 2018 | 0.934    |

    Results skew toward family-friendly animated and live-action films, Disney, Pixar, and DreamWorks titles dominate.

    **In-Domain Results (Movies, Input: The Dark Knight)**

    | Title                   | Year | Affinity |
    | ----------------------- | ---- | -------- |
    | _Batman Begins_         | 2005 | 0.932    |
    | _The Dark Knight Rises_ | 2012 | 0.932    |
    | _The Godfather_         | 1972 | 0.928    |
    | _The Godfather Part II_ | 1974 | 0.925    |
    | _12 Angry Men_          | 1957 | 0.914    |

    A broad commercial input (Target) surfaces recent, high-grossing family films. A prestige-drama input (_The Dark Knight_) surfaces critically acclaimed, darker, male-skewing films. Affinity results reflect the taste profile implied by the input entity, not genre or era matching alone.

  </Tab>

  <Tab title="Music Artists">
    # Music Artists

    The Music Artists entity type covers recording artists, bands, and musicians across all genres and eras. Entities represent the artist or group, not individual albums or songs.

    ### Common Use Cases

    - Music recommendation and playlist personalization
    - Audience segmentation by musical taste
    - Cross-domain cultural intelligence (e.g., identifying which brands align with a given artist's fan base)

    ### Taxonomy

    <Callout icon="🎵" theme="info">
      ### Taxonomy Structure

      Music artists are classified using `urn:tag:genre:music` tags. An artist may carry multiple tags. Artists may also carry `urn:tag:audience:qloo` tags describing audience characteristics (e.g., loyal, passionate, youthful).
    </Callout>

    | Tag name             | URN                                        |
    | -------------------- | ------------------------------------------ |
    | 60s                  | `urn:tag:genre:music:60s`                  |
    | 80s                  | `urn:tag:genre:music:eighties`             |
    | Acoustic             | `urn:tag:genre:music:acoustic`             |
    | Alt Country          | `urn:tag:genre:music:alt_country`          |
    | Alternative Rock     | `urn:tag:genre:music:alternative_rock`     |
    | Ambient              | `urn:tag:genre:music:ambient`              |
    | American             | `urn:tag:genre:music:american`             |
    | American Idol        | `urn:tag:genre:music:american_idol`        |
    | Americana            | `urn:tag:genre:music:americana`            |
    | Bebop                | `urn:tag:genre:music:bebop`                |
    | Blues                | `urn:tag:genre:music:blues`                |
    | Blues Rock           | `urn:tag:genre:music:blues_rock`           |
    | Canadian             | `urn:tag:genre:music:canadian`             |
    | Chill Out            | `urn:tag:genre:music:chill_out`            |
    | Classic Blues        | `urn:tag:genre:music:classic_blues`        |
    | Classic Country      | `urn:tag:genre:music:classic_country`      |
    | Classic Rock         | `urn:tag:genre:music:classic_rock`         |
    | Classical            | `urn:tag:genre:music:classical`            |
    | Contemporary Country | `urn:tag:genre:music:contemporary_country` |
    | Country              | `urn:tag:genre:music:country`              |
    | Country Pop          | `urn:tag:genre:music:country_pop`          |
    | Country Rock         | `urn:tag:genre:music:country_rock`         |
    | Dance                | `urn:tag:genre:music:dance`                |
    | Electronic           | `urn:tag:genre:music:electronic`           |
    | Emo                  | `urn:tag:genre:music:emo`                  |
    | Experimental         | `urn:tag:genre:music:experimental`         |
    | Folk                 | `urn:tag:genre:music:folk`                 |
    | Folk Rock            | `urn:tag:genre:music:folk_rock`            |
    | Funk                 | `urn:tag:genre:music:funk`                 |
    | Gospel               | `urn:tag:genre:music:gospel`               |
    | Hard Rock            | `urn:tag:genre:music:hard_rock`            |
    | Heavy Metal          | `urn:tag:genre:music:heavy_metal`          |
    | Hip-Hop              | `urn:tag:genre:music:hip_hop`              |
    | House                | `urn:tag:genre:music:house`                |
    | Indie                | `urn:tag:genre:music:indie`                |
    | Indie Pop            | `urn:tag:genre:music:indie_pop`            |
    | Indie Rock           | `urn:tag:genre:music:indie_rock`           |
    | Irish                | `urn:tag:genre:music:irish`                |
    | Jazz                 | `urn:tag:genre:music:jazz`                 |
    | Mellow               | `urn:tag:genre:music:mellow`               |
    | Metal                | `urn:tag:genre:music:metal`                |
    | Modern Country       | `urn:tag:genre:music:modern_country`       |
    | Piano                | `urn:tag:genre:music:piano`                |
    | Piano Rock           | `urn:tag:genre:music:piano_rock`           |
    | Pop                  | `urn:tag:genre:music:pop`                  |
    | Pop Rock             | `urn:tag:genre:music:pop_rock`             |
    | Psychedelic          | `urn:tag:genre:music:psychedelic`          |
    | Punk                 | `urn:tag:genre:music:punk`                 |
    | Rap                  | `urn:tag:genre:music:rap`                  |
    | Reggae               | `urn:tag:genre:music:reggae`               |
    | Rock                 | `urn:tag:genre:music:rock`                 |
    | Singer & Songwriter  | `urn:tag:genre:music:singer_songwriter`    |
    | Soul                 | `urn:tag:genre:music:soul`                 |
    | Southern Rock        | `urn:tag:genre:music:southern_rock`        |
    | Techno               | `urn:tag:genre:music:techno`               |
    | Trance               | `urn:tag:genre:music:trance`               |

    ### Schema Reference

    | Field             | Type              | Description                      | Nullable |
    | ----------------- | ----------------- | -------------------------------- | -------- |
    | entity_id         | string (UUID)     | Unique identifier                | No       |
    | type              | string            | Always "urn:entity"              | No       |
    | subtype           | string            | Always "urn:entity:artist"       | No       |
    | name              | string            | Artist or band name              | No       |
    | short_description | string            | Brief artist biography           | Yes      |
    | url               | string (URL)      | Qloo image URL                   | Yes      |
    | date_of_birth     | string (ISO date) | Artist date of birth             | Yes      |
    | year_of_death     | integer           | Year of death, if applicable     | Yes      |
    | place_of_birth    | string            | City/region of birth             | Yes      |
    | akas              | array of strings  | Alternative known names          | Yes      |
    | popularity        | float (0–1)       | Normalized popularity score      | No       |
    | affinity          | float (0–1)       | Affinity score relative to input | No       |
    | audience_growth   | float             | Audience growth signal           | Yes      |
    | disambiguation    | string            | Disambiguation note              | Yes      |
    | tags              | array of objects  | Genre and audience tags          | Yes      |

    ### Canonical JSON Example

    Example request: Music Artists, in-domain, input entity Bob Dylan. Example response entity: Neil Young (affinity: 0.930, most complete metadata and highest affinity in the result set).

    ```json
    {
      "entity_id": "BC212422-0726-4219-9B65-BC7535C596E1",
      "type": "urn:entity",
      "subtype": "urn:entity:artist",
      "name": "Neil Young",
      "short_description": "Canadian-American singer-songwriter known for his distinctive guitar work and deeply personal lyrics.",
      "url": "https://images.qloo.com/i/BC212422-0726-4219-9B65-BC7535C596E1-420x-auto.jpg",
      "date_of_birth": "1945-11-12",
      "place_of_birth": "Toronto, Ontario, Canada",
      "popularity": 0.9993218875142961,
      "affinity": 0.9297053737831464,
      "audience_growth": 0,
      "disambiguation": "Neil Young",
      "tags": [
        { "id": "urn:tag:genre:music:rock", "name": "Rock", "type": "urn:tag:genre:music" },
        { "id": "urn:tag:genre:music:classic_rock", "name": "Classic Rock", "type": "urn:tag:genre:music" },
        { "id": "urn:tag:genre:music:folk_rock", "name": "Folk - Rock", "type": "urn:tag:genre:music" },
        { "id": "urn:tag:genre:music:folk", "name": "Folk", "type": "urn:tag:genre:music" }
      ]
    }
    ```

    ### Cross-Domain Comparison

    Input entity: `target`, queried across all entity types.

    **Cross-Domain Results (Music Artists, Input: Target)**

    | Artist          | Genres                                       | Affinity |
    | --------------- | -------------------------------------------- | -------- |
    | Kris Allen      | Singer & Songwriter, American Idol, Acoustic | 0.935    |
    | The Band Perry  | Modern Country, Country                      | 0.929    |
    | Train           | Alternative Rock, Rock, Indie                | 0.927    |
    | Sara Bareilles  | Acoustic, Singer & Songwriter, Piano         | 0.927    |
    | Lady Antebellum | Country Pop, Country, Modern Country         | 0.926    |
    | Rascal Flatts   | Country Pop, Country, Rock                   | 0.914    |

    Results skew toward mainstream country, pop-country, and acoustic singer-songwriter artists, genre segments with broad commercial appeal.

    **In-Domain Results (Music Artists, Input: Bob Dylan)**

    | Artist            | Genres                                            | Affinity |
    | ----------------- | ------------------------------------------------- | -------- |
    | Neil Young        | Rock, Classic Rock, Folk Rock, Folk               | 0.930    |
    | Simon & Garfunkel | Folk, Rock, Singer & Songwriter, Classic Rock     | 0.921    |
    | Johnny Cash       | Singer & Songwriter, Folk, Rock, Classic Rock     | 0.907    |
    | Cat Stevens       | Acoustic, Classic Rock, Singer & Songwriter, Folk | 0.907    |
    | The Band          | Folk Rock, Classic Rock, Americana, Rock          | 0.903    |
    | Leonard Cohen     | Rock, Blues, Canadian, Folk                       | 0.884    |

    A broad commercial input (Target) surfaces radio-friendly, commercially dominant artists. A niche cultural input (Bob Dylan) surfaces a coherent neighborhood of 1960s–70s folk, rock, and Americana artists centered on literary songwriting and countercultural heritage. Affinity results reveal genuine taste-community structure, not just genre adjacency.

  </Tab>

  <Tab title="People">
    # People

    The People entity type covers public figures: entertainers, athletes, politicians, journalists, influencers, and more. Entities represent individual people, not characters or fictional personas.

    ### Common Use Cases

    - Celebrity and public figure affinity analysis
    - Audience enrichment using cultural preferences tied to public personas
    - Influencer identification and alignment

    ### Taxonomy

    <Callout icon="🎤" theme="info">
      ### Taxonomy Structure

      People entities are classified using `urn:tag:genre:person` tags (type of public figure), `urn:tag:occupation:person` tags (specific occupation), and `urn:tag:wikipedia_category:wikidata` encyclopedic categories.
    </Callout>

    **Type of Public Figure (Genre)**

    | Tag name         | URN                                     |
    | ---------------- | --------------------------------------- |
    | Academic         | `urn:tag:genre:person:academic`         |
    | Activist         | `urn:tag:genre:person:activist`         |
    | Actor            | `urn:tag:genre:person:actor`            |
    | Athlete          | `urn:tag:genre:person:athlete`          |
    | Author           | `urn:tag:genre:person:author`           |
    | Chef             | `urn:tag:genre:person:chef`             |
    | Comedian         | `urn:tag:genre:person:comedian`         |
    | Fashion Designer | `urn:tag:genre:person:fashion_designer` |
    | Influencer       | `urn:tag:genre:person:influencer`       |
    | Journalist       | `urn:tag:genre:person:journalist`       |
    | Lawyer           | `urn:tag:genre:person:lawyer`           |
    | Model            | `urn:tag:genre:person:model`            |
    | Musician         | `urn:tag:genre:person:musician`         |
    | Politician       | `urn:tag:genre:person:politician`       |
    | YouTuber         | `urn:tag:genre:person:youtuber`         |

    **Occupation**

    | Tag name                       | URN                                                        |
    | ------------------------------ | ---------------------------------------------------------- |
    | Actor                          | `urn:tag:occupation:person:actor`                          |
    | Bridge Player                  | `urn:tag:occupation:person:bridge_player`                  |
    | Dancer                         | `urn:tag:occupation:person:dancer`                         |
    | Guitarist                      | `urn:tag:occupation:person:guitarist`                      |
    | Investor                       | `urn:tag:occupation:person:investor`                       |
    | Music Video Director           | `urn:tag:occupation:person:music_video_director`           |
    | Musician                       | `urn:tag:occupation:person:musician`                       |
    | Physician                      | `urn:tag:occupation:person:physician`                      |
    | Presenter                      | `urn:tag:occupation:person:presenter`                      |
    | Programmer                     | `urn:tag:occupation:person:programmer`                     |
    | Radio Personality              | `urn:tag:occupation:person:radio_personality`              |
    | Rapper                         | `urn:tag:occupation:person:rapper`                         |
    | Real Estate Agent              | `urn:tag:occupation:person:real_estate_agent`              |
    | Reality Television Participant | `urn:tag:occupation:person:reality_television_participant` |
    | Record Producer                | `urn:tag:occupation:person:record_producer`                |
    | Singer                         | `urn:tag:occupation:person:singer`                         |
    | Singer-Songwriter              | `urn:tag:occupation:person:singer_songwriter`              |
    | Talk Show Host                 | `urn:tag:occupation:person:talk_show_host`                 |
    | Television Presenter           | `urn:tag:occupation:person:television_presenter`           |
    | Voice Actor                    | `urn:tag:occupation:person:voice_actor`                    |
    | Writer                         | `urn:tag:occupation:person:writer`                         |

    ### Schema Reference

    | Field             | Type                    | Description                                    | Nullable |
    | ----------------- | ----------------------- | ---------------------------------------------- | -------- |
    | entity_id         | string (UUID)           | Unique identifier                              | No       |
    | type              | string                  | Always "urn:entity"                            | No       |
    | subtype           | string                  | Always "urn:entity:person"                     | No       |
    | name              | string                  | Full name                                      | No       |
    | url               | string (URL)            | Qloo image URL                                 | Yes      |
    | date_of_birth     | string (ISO date)       | Date of birth                                  | Yes      |
    | gender            | array of strings        | Gender identifier(s)                           | Yes      |
    | nationality       | array of strings        | Country/countries of nationality               | Yes      |
    | place_of_birth    | string                  | City/region of birth                           | Yes      |
    | parents           | array of strings        | Names of parents                               | Yes      |
    | children          | array of strings        | Names of children                              | Yes      |
    | siblings          | array of strings        | Names of siblings                              | Yes      |
    | spouses           | array of strings        | Names of spouse(s)                             | Yes      |
    | partners          | array of strings        | Names of romantic partners                     | Yes      |
    | awards            | array of strings        | Notable awards received                        | Yes      |
    | instruments       | array of strings        | Instruments played (musicians)                 | Yes      |
    | influences        | array of strings        | Named artistic/personal influences             | Yes      |
    | employers         | array of strings        | Associated organizations/employers             | Yes      |
    | notable_works     | array of strings        | Key works (films, albums, books, TV shows)     | Yes      |
    | positions_held    | array of strings        | Titles/roles held                              | Yes      |
    | websites          | array of strings (URLs) | Official or notable URLs                       | Yes      |
    | interests         | array of strings        | Known personal interests                       | Yes      |
    | work_period_start | string (ISO date)       | Career start date                              | Yes      |
    | popularity        | float (0–1)             | Normalized popularity score                    | No       |
    | affinity          | float (0–1)             | Affinity score relative to input               | No       |
    | audience_growth   | float                   | Audience growth signal                         | Yes      |
    | disambiguation    | string                  | Date of birth for disambiguation               | Yes      |
    | tags              | array of objects        | Genre, occupation, and Wikipedia category tags | Yes      |

    ### Canonical JSON Example

    Example request: People, in-domain, input entity Oprah Winfrey. Example response entity: Ellen DeGeneres (highest-affinity result with the most complete metadata, popularity: 0.9999).

    ```json
    {
      "entity_id": "1FFFE559-16A2-4B66-9988-7091331B75B7",
      "type": "urn:entity",
      "subtype": "urn:entity:person",
      "name": "Ellen DeGeneres",
      "url": "https://images.qloo.com/i/1FFFE559-16A2-4B66-9988-7091331B75B7-420x-auto.jpg",
      "date_of_birth": "1958-01-26",
      "gender": ["female"],
      "nationality": ["United States of America"],
      "parents": ["Elliott Everett DeGeneres Jr."],
      "awards": [
        "Presidential Medal of Freedom",
        "star on Hollywood Walk of Fame",
        "Mark Twain Prize for American Humor",
        "Daytime Emmy Award for Outstanding Talk Show Host",
        "Daytime Emmy Award for Outstanding Talk Show"
      ],
      "instruments": [],
      "influences": ["Steve Martin", "Lucille Ball", "Carol Burnett", "Woody Allen"],
      "notable_works": ["Ellen", "The Ellen DeGeneres Show", "Finding Dory", "Finding Nemo"],
      "websites": ["https://www.ellentube.com"],
      "spouses": ["Portia de Rossi"],
      "work_period_start": "1978-01-01",
      "popularity": 0.9999347691371044,
      "affinity": 0.9410380930260895,
      "audience_growth": 0,
      "disambiguation": "1958-01-26",
      "tags": [
        { "id": "urn:tag:wikipedia_category:wikidata:presidential_medal_freedom_recipients", "name": "Presidential Medal Of Freedom Recipients", "type": "urn:tag:wikipedia_category:wikidata" },
        { "id": "urn:tag:wikipedia_category:wikidata:american_women_television_hosts", "name": "American Women Television Hosts", "type": "urn:tag:wikipedia_category:wikidata" }
      ]
    }
    ```

    ### Cross-Domain Comparison

    Input entity: `target`, queried across all entity types.

    **Cross-Domain Results (People, Input: Target)**

    | Person           | Primary Association           | Affinity |
    | ---------------- | ----------------------------- | -------- |
    | Carrie Underwood | Country Music / American Idol | 0.973    |
    | Miranda Lambert  | Country Music                 | 0.959    |
    | Chase Chrisley   | Reality TV                    | 0.956    |
    | Sadie Robertson  | Reality TV / Faith            | 0.948    |
    | Tim McGraw       | Country Music                 | 0.950    |
    | Faith Hill       | Country Music                 | 0.949    |

    Results surface public figures associated with mainstream American country music, reality TV, and family-friendly entertainment.

    **In-Domain Results (People, Input: Oprah Winfrey)**

    | Person          | Primary Association       | Affinity |
    | --------------- | ------------------------- | -------- |
    | Ellen DeGeneres | Talk Show / Comedy / Film | 0.941    |
    | Tyra Banks      | Modeling / Reality TV     | 0.935    |
    | Alicia Keys     | Music                     | 0.935    |
    | John Legend     | Music                     | 0.935    |
    | Ryan Seacrest   | TV Host / Radio           | 0.932    |
    | Anderson Cooper | Journalism / TV           | 0.929    |

    A broad commercial input (Target) surfaces country music stars and reality TV personalities. Oprah surfaces media personalities, musicians, and journalists sharing her profile as a cultural institution and philanthropic public figure. The People entity type captures the taste neighborhood around a person's cultural world, not just their occupation.

  </Tab>

  <Tab title="Places">
    # Places

    The Places entity type covers physical locations: restaurants, hotels, parks, attractions, landmarks, and more. Entities are real-world places with geographic coordinates and business data.

    ### Common Use Cases

    - Location-aware personalization and travel recommendations
    - Destination discovery based on cultural taste profiles
    - Out-of-home advertising and geotargeting enrichment

    ### Taxonomy

    <Callout icon="📍" theme="info">
      ### Taxonomy Structure

      Places are classified using `urn:tag:genre:place` alongside a rich set of attribute tags spanning ambience, amenities, cuisine, pricing, and more.
    </Callout>

    **Top-Level Place Categories (Examples)**

    | Tag name            | URN                                       |
    | ------------------- | ----------------------------------------- |
    | Adventure Sports    | `urn:tag:genre:place:adventure_sports`    |
    | Art Gallery         | `urn:tag:genre:place:art_gallery`         |
    | Castle              | `urn:tag:genre:place:castle`              |
    | Historical Landmark | `urn:tag:genre:place:historical_landmark` |
    | Hotel               | `urn:tag:genre:place:hotel`               |
    | Museum              | `urn:tag:genre:place:museum`              |
    | Park                | `urn:tag:genre:place:park`                |
    | Restaurant          | `urn:tag:genre:place:restaurant`          |
    | Shopping Mall       | `urn:tag:genre:place:shopping_mall`       |
    | Sports              | `urn:tag:genre:place:sports`              |
    | Tourist Attraction  | `urn:tag:genre:place:tourist_attraction`  |

    **Hotel Subcategories**

    | Tag name      | URN                                       |
    | ------------- | ----------------------------------------- |
    | Capsule       | `urn:tag:genre:place:hotel:capsule`       |
    | Forest Resort | `urn:tag:genre:place:hotel:forest_resort` |
    | Hostel        | `urn:tag:genre:place:hotel:hostel`        |
    | Inn           | `urn:tag:genre:place:hotel:inn`           |
    | Resort        | `urn:tag:genre:place:hotel:resort`        |
    | Ski Resort    | `urn:tag:genre:place:hotel:ski_resort`    |
    | Wellness      | `urn:tag:genre:place:hotel:wellness`      |

    **Restaurant Subcategories**

    | Tag name      | URN                                                                                   |
    | ------------- | ------------------------------------------------------------------------------------- |
    | American      | `urn:tag:genre:place:restaurant:american`                                             |
    | Asian         | `urn:tag:genre:place:restaurant:asian`                                                |
    | Bakery        | `urn:tag:genre:place:restaurant:bakery`                                               |
    | Bar           | `urn:tag:genre:place:restaurant:bar`                                                  |
    | Barbecue      | `urn:tag:genre:place:restaurant:barbecue`                                             |
    | Cafe          | `urn:tag:genre:place:restaurant:cafe`                                                 |
    | Fine Dining   | `urn:tag:genre:place:restaurant:fine_dining`                                          |
    | Italian       | `urn:tag:genre:place:restaurant:italian`                                              |
    | Japanese      | `urn:tag:genre:place:restaurant:japanese`                                             |
    | Mediterranean | `urn:tag:genre:place:restaurant:mediterranean`                                        |
    | Seafood       | `urn:tag:genre:place:restaurant:seafood`                                              |
    | Steak House   | `urn:tag:genre:place:restaurant:steak_house` (also `urn:tag:genre:place:steak_house`) |
    | Vegan         | `urn:tag:genre:place:restaurant:vegan`                                                |

    **Additional Attribute Tags**

    | Tag name           | URN                                        | Description                                                       |
    | ------------------ | ------------------------------------------ | ----------------------------------------------------------------- |
    | Ambience           | `urn:tag:ambience:qloo`                    | Atmosphere descriptors (e.g., Bright, Relaxing, Festive, Stylish) |
    | Amenities          | `urn:tag:amenity:place`                    | Facilities and features present (e.g., Wi-Fi, Pool, Golf Course)  |
    | Accessibility      | `urn:tag:accessibility:place`              | Accessibility features (e.g., Wheelchair accessible entrance)     |
    | Cuisine            | `urn:tag:cuisine:qloo`                     | Cuisine type (e.g., Seafood, Fondue, Desserts)                    |
    | Customer Identity  | `urn:tag:customer_identity:qloo`           | Who the place is for (e.g., Tourists, Wedding Parties)            |
    | Decor              | `urn:tag:decor:qloo`                       | Decor style (e.g., Elegant, Historic)                             |
    | Dining Options     | `urn:tag:dining_option:qloo`               | Dining style (e.g., Fine Dining, Wine Bar, Cafe)                  |
    | Dining Service     | `urn:tag:dining_options:place`             | Meal periods (e.g., Dinner, Lunch)                                |
    | Good For           | `urn:tag:good_for:qloo`                    | Occasion suitability (e.g., Special Occasions, Birthdays)         |
    | Menu Highlights    | `urn:tag:menu_highlight:qloo`              | Signature dishes or menu features                                 |
    | Nearby Attractions | `urn:tag:nearby_attraction:qloo`           | Notable nearby landmarks                                          |
    | Neighborhood       | `urn:tag:neighborhood_characteristic:qloo` | Area characteristics (e.g., Walkable, Commercial)                 |
    | Parking            | `urn:tag:parking:place`                    | Parking options available                                         |
    | Payments           | `urn:tag:payments:place`                   | Payment methods and price level                                   |
    | Pets               | `urn:tag:pets:place`                       | Pet policies (e.g., Dogs allowed, Dog park)                       |
    | Room Type          | `urn:tag:room_type:qloo`                   | Room categories (hotels only)                                     |
    | Service Options    | `urn:tag:service_options:place`            | Service types (e.g., Takeout, Onsite services)                    |
    | Service Type       | `urn:tag:service_type:qloo`                | Additional service types (e.g., Bar Service, Pickup)              |
    | Setting            | `urn:tag:setting:qloo`                     | Location setting (e.g., Urban, Downtown)                          |
    | Specialty Dish     | `urn:tag:specialty_dish:place`             | Specific notable dishes                                           |
    | View               | `urn:tag:view:qloo`                        | Views available (e.g., Pool View, Forest View)                    |

    ### Schema Reference

    | Field             | Type             | Description                                        | Nullable |
    | ----------------- | ---------------- | -------------------------------------------------- | -------- |
    | entity_id         | string (UUID)    | Unique identifier                                  | No       |
    | type              | string           | Always "urn:entity"                                | No       |
    | subtype           | string           | Always "urn:entity:place"                          | No       |
    | name              | string           | Place name                                         | No       |
    | description       | string           | Long-form description                              | Yes      |
    | short_description | string           | Brief summary                                      | Yes      |
    | url               | string (URL)     | Qloo image URL                                     | Yes      |
    | address           | string           | Street address                                     | Yes      |
    | city              | string           | City                                               | Yes      |
    | admin1_region     | string           | State or first-level administrative region         | Yes      |
    | admin2_region     | string           | County or second-level administrative region       | Yes      |
    | country           | string           | Country name                                       | Yes      |
    | country_code      | string           | ISO country code                                   | Yes      |
    | metro             | string           | Metro area name                                    | Yes      |
    | neighborhood      | string           | Neighborhood name                                  | Yes      |
    | lat               | float            | Latitude coordinate                                | Yes      |
    | lon               | float            | Longitude coordinate                               | Yes      |
    | phone             | string           | Contact phone number                               | Yes      |
    | website           | string (URL)     | Place website                                      | Yes      |
    | menu_url          | string (URL)     | Menu URL (restaurants)                             | Yes      |
    | business_rating   | float            | Business rating (e.g., Google rating)              | Yes      |
    | price_level       | integer (1–4)    | Price level indicator                              | Yes      |
    | currency          | string           | Currency code (e.g., "usd")                        | Yes      |
    | price_range.from  | float            | Minimum price                                      | Yes      |
    | price_range.to    | float            | Maximum price                                      | Yes      |
    | hotel_class       | integer          | Hotel star class (hotels only)                     | Yes      |
    | number_of_rooms   | integer          | Room count (hotels only)                           | Yes      |
    | is_closed         | boolean          | Whether the place is permanently closed            | No       |
    | popularity        | float (0–1)      | Normalized popularity score                        | No       |
    | affinity          | float (0–1)      | Affinity score relative to input                   | No       |
    | audience_growth   | float            | Audience growth signal                             | Yes      |
    | disambiguation    | string           | Address for disambiguation                         | Yes      |
    | tags              | array of objects | Genre, ambience, amenity, and other attribute tags | Yes      |

    ### Canonical JSON Example

    Example request: Places, in-domain, input entity Central Park. Example response entity: Brooklyn Bridge Park (highest-affinity result with the richest metadata, popularity: 0.9999).

    ```json
    {
      "entity_id": "477972BC-8855-4C3D-87D0-6A56CB03B56E",
      "type": "urn:entity",
      "subtype": "urn:entity:place",
      "name": "Brooklyn Bridge Park",
      "description": "This urban oasis features shaded picnic tables, hibachi-style BBQ grills & river views.",
      "url": "https://images.qloo.com/i/477972BC-8855-4C3D-87D0-6A56CB03B56E-420x-auto.jpg",
      "address": "Brooklyn, NY 11201",
      "city": "New York",
      "admin1_region": "New York",
      "admin2_region": "Kings County",
      "country": "United States",
      "country_code": "US",
      "metro": "New York City",
      "neighborhood": "Whitehall",
      "lat": 40.7022422,
      "lon": -73.9958601,
      "website": "https://www.brooklynbridgepark.org/",
      "business_rating": 4.8,
      "is_closed": false,
      "popularity": 0.9999587682631521,
      "affinity": 0.9279005703211739,
      "audience_growth": -4.996003610813204e-16,
      "disambiguation": "Brooklyn, NY 11201",
      "tags": [
        { "id": "urn:tag:amenity:place:slides", "name": "Slides", "type": "urn:tag:amenity:place" },
        { "id": "urn:tag:amenity:place:picnic_tables", "name": "Picnic tables", "type": "urn:tag:amenity:place" },
        { "id": "urn:tag:category:place:park", "name": "Park", "type": "urn:tag:category:place" },
        { "id": "urn:tag:amenity:place:wi_fi", "name": "Wi-Fi", "type": "urn:tag:amenity:place" }
      ]
    }
    ```

    ### Cross-Domain Comparison

    Input entity: `target`, queried across all entity types.

    **Cross-Domain Results (Places, Input: Target)**

    | Place                                | Type               | Location      | Affinity |
    | ------------------------------------ | ------------------ | ------------- | -------- |
    | Disney's Contemporary Resort         | Resort Hotel       | Bay Lake, FL  | 0.928    |
    | The Hollywood Brown Derby            | Restaurant         | Bay Lake, FL  | 0.920    |
    | Paddlefish                           | Seafood Restaurant | Orlando, FL   | 0.918    |
    | Morimoto Asia                        | Restaurant         | Orlando, FL   | 0.915    |
    | Hard Rock Hotel at Universal Orlando | Hotel              | Orlando, FL   | 0.911    |
    | Gaylord Opryland Resort              | Resort Hotel       | Nashville, TN | 0.907    |

    Results skew toward Walt Disney World, family resort dining, and family-friendly Tennessee destinations.

    **In-Domain Results (Places, Input: Central Park)**

    | Place                        | Type          | Location     | Affinity |
    | ---------------------------- | ------------- | ------------ | -------- |
    | Brooklyn Bridge Park         | Park          | Brooklyn, NY | 0.928    |
    | Westfield World Trade Center | Shopping Mall | New York, NY | 0.924    |
    | Little Italy                 | Neighborhood  | New York, NY | 0.922    |
    | General Sherman Monument     | Landmark      | New York, NY | 0.920    |
    | Central Park Zoo             | Zoo           | New York, NY | 0.919    |
    | Chrysler Building            | Landmark      | New York, NY | 0.917    |

    A broad commercial input (Target) routes to family resort destinations in Florida and Tennessee. A specific urban landmark (Central Park) routes to Manhattan and Brooklyn cultural landmarks, parks, and public spaces. The Places entity type is highly responsive to the geographic and lifestyle context implied by the input entity.

  </Tab>

  <Tab title="Podcasts">
    # Podcasts

    The Podcasts entity type covers audio podcast series across all genres: talk, interview, comedy, news, true crime, education, and more. Entities represent the show series, not individual episodes.

    ### Common Use Cases

    - Podcast recommendation and discovery
    - Audience affinity analysis based on listening habits
    - Content strategy and editorial planning

    ### Taxonomy

    <Callout icon="🎙️" theme="info">
      ### Taxonomy Structure

      Podcasts use the shared `urn:tag:genre:media` namespace, the same tag namespace as Books, Movies, and TV Shows.
    </Callout>

    | Tag name          | URN                                     |
    | ----------------- | --------------------------------------- |
    | After Shows       | `urn:tag:genre:media:after_shows`       |
    | Arts              | `urn:tag:genre:media:arts`              |
    | Business          | `urn:tag:genre:media:business`          |
    | Comedy            | `urn:tag:genre:media:comedy`            |
    | Comedy Interviews | `urn:tag:genre:media:comedy_interviews` |
    | Design            | `urn:tag:genre:media:design`            |
    | Education         | `urn:tag:genre:media:education`         |
    | Entrepreneurship  | `urn:tag:genre:media:entrepreneurship`  |
    | Health & Fitness  | `urn:tag:genre:media:health_fitness`    |
    | Kids & Family     | `urn:tag:genre:media:kids_family`       |
    | Medicine          | `urn:tag:genre:media:medicine`          |
    | Mental Health     | `urn:tag:genre:media:mental_health`     |
    | News              | `urn:tag:genre:media:news`              |
    | Parenting         | `urn:tag:genre:media:parenting`         |
    | Personal Journals | `urn:tag:genre:media:personal_journals` |
    | Podcasts          | `urn:tag:genre:media:podcasts`          |
    | Relationships     | `urn:tag:genre:media:relationships`     |
    | Self-Improvement  | `urn:tag:genre:media:self_improvement`  |
    | Society & Culture | `urn:tag:genre:media:society_culture`   |
    | TV & Film         | `urn:tag:genre:media:tv_film`           |
    | TV Reviews        | `urn:tag:genre:media:tv_reviews`        |

    ### Schema Reference

    | Field             | Type              | Description                                                  | Nullable |
    | ----------------- | ----------------- | ------------------------------------------------------------ | -------- |
    | entity_id         | string (UUID)     | Unique identifier                                            | No       |
    | type              | string            | Always "urn:entity"                                          | No       |
    | subtype           | string            | Always "urn:entity:podcast"                                  | No       |
    | name              | string            | Show title                                                   | No       |
    | description       | string            | Full show description                                        | Yes      |
    | short_description | string            | Brief summary                                                | Yes      |
    | url               | string (URL)      | Qloo image URL                                               | Yes      |
    | channel           | string            | Channel or network name                                      | Yes      |
    | rating            | float             | Listener rating                                              | Yes      |
    | episode_count     | string            | Number of episodes (note: returned as string in current API) | Yes      |
    | release_date      | string (ISO date) | Date of most recent episode in result set                    | Yes      |
    | content_rating    | string            | "clean" or "explicit"                                        | Yes      |
    | akas              | array of strings  | Alternative names                                            | Yes      |
    | popularity        | float (0–1)       | Normalized popularity score                                  | No       |
    | affinity          | float (0–1)       | Affinity score relative to input                             | No       |
    | audience_growth   | float             | Audience growth signal                                       | Yes      |
    | disambiguation    | string            | Disambiguation note                                          | Yes      |
    | tags              | array of objects  | Genre tags                                                   | Yes      |

    ### Canonical JSON Example

    Example request: Podcasts, in-domain, input entity _SmartLess_. Example response entity: _Conan O'Brien Needs a Friend_ (highest-affinity celebrity interview comedy podcast with complete metadata, popularity: 0.9990).

    ```json
    {
      "entity_id": "DE544BD4-35A1-4FDA-BC2C-3749E7F5E6C7",
      "type": "urn:entity",
      "subtype": "urn:entity:podcast",
      "name": "Conan O'Brien Needs A Friend",
      "description": "After 25 years at the Late Night desk, Conan realized that the only people at his holiday party are the men and women who work for him. So, he started a podcast to do just that. Deeper, unboundedly playful, and free from FCC regulations, Conan O'Brien Needs a Friend is a weekly opportunity for Conan to hang out with the people he enjoys most and perhaps find some real friendship along the way.",
      "short_description": "Conan O'Brien explores friendship through candid conversations with celebrities, comedians, and personal friends in a playful podcast format.",
      "url": "https://images.qloo.com/i/DE544BD4-35A1-4FDA-BC2C-3749E7F5E6C7-420x-auto.jpg",
      "channel": "Conan O'Brien Needs A Friend",
      "rating": 4.8,
      "episode_count": "15",
      "release_date": "2024-07-08",
      "content_rating": "Explicit",
      "popularity": 0.9990460006558746,
      "affinity": 0.9174014901005887,
      "audience_growth": 0,
      "disambiguation": "",
      "tags": [
        { "id": "urn:tag:genre:media:comedy", "name": "Comedy", "type": "urn:tag:genre:media" },
        { "id": "urn:tag:genre:media:podcasts", "name": "Podcasts", "type": "urn:tag:genre:media" }
      ]
    }
    ```

    ### Cross-Domain Comparison

    Input entity: `target`, queried across all entity types.

    **Cross-Domain Results (Podcasts, Input: Target)**

    | Podcast                                      | Genres                           | Affinity |
    | -------------------------------------------- | -------------------------------- | -------- |
    | _Scrubbing In with Becca Tilley & Tanya Rad_ | Society & Culture, TV & Film     | 0.980    |
    | _Off The Vine with Kaitlyn Bristowe_         | TV & Film, Society & Culture     | 0.956    |
    | _Mouthing Off with Olivia Caridi_            | Society & Culture                | 0.941    |
    | _The Ben and Ashley I Almost Famous Podcast_ | TV & Film, Society & Culture     | 0.938    |
    | _Whine Down with Jana Kramer_                | Relationships, Society & Culture | 0.937    |

    Results route to _Bachelor_ franchise podcasts and reality TV companion shows, a niche that overlaps with Target's mainstream female-skewing audience.

    **In-Domain Results (Podcasts, Input: SmartLess)**

    | Podcast                                              | Genres                           | Affinity |
    | ---------------------------------------------------- | -------------------------------- | -------- |
    | _Literally! With Rob Lowe_                           | Society & Culture                | 0.942    |
    | _HypochondriActor_                                   | Comedy, Medicine                 | 0.925    |
    | _Conan O'Brien Needs A Friend_                       | Comedy                           | 0.917    |
    | _Fly on the Wall with Dana Carvey and David Spade_   | Comedy, Comedy Interviews        | 0.913    |
    | _Sibling Revelry with Kate Hudson and Oliver Hudson_ | Society & Culture, Relationships | 0.902    |

    A broad commercial input (Target) routes to reality TV companion podcasts. A celebrity-hosted comedy input (_SmartLess_) routes to interview and comedy podcasts built around warm, candid conversations between famous hosts and their famous friends. The Podcasts entity type captures the social texture of listening preferences, not just topic.

  </Tab>

  <Tab title="TV Shows">
    # TV Shows

    The TV Shows entity type covers episodic television series: scripted drama, comedy, reality, limited series, and more. Entities represent the show as a whole, not individual seasons or episodes.

    ### Common Use Cases

    - TV recommendation and discovery
    - Audience taste profiling based on viewing preferences
    - Content investment and development intelligence

    ### Taxonomy

    <Callout icon="📺" theme="info">
      ### Taxonomy Structure

      TV Shows use the shared `urn:tag:genre:media` namespace alongside `urn:tag:keyword:media` thematic tags for granular content signals (e.g., `drug_cartel`, `psychological_thriller`, `workplace_comedy`).
    </Callout>

    **Primary Genre Tags**

    | Tag name    | URN                               |
    | ----------- | --------------------------------- |
    | Action      | `urn:tag:genre:media:action`      |
    | Biography   | `urn:tag:genre:media:biography`   |
    | Comedy      | `urn:tag:genre:media:comedy`      |
    | Crime       | `urn:tag:genre:media:crime`       |
    | Documentary | `urn:tag:genre:media:documentary` |
    | Drama       | `urn:tag:genre:media:drama`       |
    | Fantasy     | `urn:tag:genre:media:fantasy`     |
    | Mystery     | `urn:tag:genre:media:mystery`     |
    | Reality TV  | `urn:tag:genre:media:reality_tv`  |
    | Romance     | `urn:tag:genre:media:romance`     |
    | Sci-Fi      | `urn:tag:genre:media:sci_fi`      |
    | Thriller    | `urn:tag:genre:media:thriller`    |

    **Keyword Tags**

    | Tag name                  | URN                                               |
    | ------------------------- | ------------------------------------------------- |
    | 2010s                     | `urn:tag:keyword:media:2010s`                     |
    | Adultery                  | `urn:tag:keyword:media:adultery`                  |
    | American Mobster          | `urn:tag:keyword:media:american_mobster`          |
    | Attorney                  | `urn:tag:keyword:media:attorney`                  |
    | Biker Culture             | `urn:tag:keyword:media:biker_culture`             |
    | Boston Massachusetts      | `urn:tag:keyword:media:boston_massachusetts`      |
    | Christian Man             | `urn:tag:keyword:media:christian_man`             |
    | Conspiracy                | `urn:tag:keyword:media:conspiracy`                |
    | Crime Boss                | `urn:tag:keyword:media:crime_boss`                |
    | Cult                      | `urn:tag:keyword:media:cult`                      |
    | Drug Cartel               | `urn:tag:keyword:media:drug_cartel`               |
    | Drug Trafficking          | `urn:tag:keyword:media:drug_trafficking`          |
    | Family Relationships      | `urn:tag:keyword:media:family_relationships`      |
    | FBI Investigation         | `urn:tag:keyword:media:fbi_investigation`         |
    | Fictional Town            | `urn:tag:keyword:media:fictional_town`            |
    | Friendship                | `urn:tag:keyword:media:friendship`                |
    | Gay                       | `urn:tag:keyword:media:gay`                       |
    | Kidnapping                | `urn:tag:keyword:media:kidnapping`                |
    | LGBTQ                     | `urn:tag:keyword:media:lgbtq`                     |
    | Marriage                  | `urn:tag:keyword:media:marriage`                  |
    | Murder                    | `urn:tag:keyword:media:murder`                    |
    | New Jersey Mafia          | `urn:tag:keyword:media:new_jersey_mafia`          |
    | New York City             | `urn:tag:keyword:media:new_york_city`             |
    | Obsessive Love            | `urn:tag:keyword:media:obsessive_love`            |
    | Outlaw Biker              | `urn:tag:keyword:media:outlaw_biker`              |
    | Police Investigation      | `urn:tag:keyword:media:police_investigation`      |
    | Prequel Television Series | `urn:tag:keyword:media:prequel_television_series` |
    | Prison                    | `urn:tag:keyword:media:prison`                    |
    | Psychological Drama       | `urn:tag:keyword:media:psychological_drama`       |
    | Psychological Thriller    | `urn:tag:keyword:media:psychological_thriller`    |
    | Psychoanalysis            | `urn:tag:keyword:media:psychoanalysis`            |
    | Serial Killer             | `urn:tag:keyword:media:serial_killer`             |
    | Sitcom Comedy             | `urn:tag:keyword:media:sitcom_comedy`             |
    | Stalking                  | `urn:tag:keyword:media:stalking`                  |
    | Unplanned Pregnancy       | `urn:tag:keyword:media:unplanned_pregnancy`       |
    | Workplace                 | `urn:tag:keyword:media:workplace`                 |
    | Workplace Comedy          | `urn:tag:keyword:media:workplace_comedy`          |

    ### Schema Reference

    | Field                | Type                    | Description                                 | Nullable |
    | -------------------- | ----------------------- | ------------------------------------------- | -------- |
    | entity_id            | string (UUID)           | Unique identifier                           | No       |
    | type                 | string                  | Always "urn:entity"                         | No       |
    | subtype              | string                  | Always "urn:entity:tv_show"                 | No       |
    | name                 | string                  | Show title                                  | No       |
    | description          | string                  | Plot synopsis                               | Yes      |
    | short_description    | string                  | Brief plot summary                          | Yes      |
    | url                  | string (URL)            | Qloo image URL                              | Yes      |
    | release_date         | string (ISO date)       | Premiere date                               | Yes      |
    | release_year         | integer                 | Premiere year                               | Yes      |
    | finale_year          | integer                 | Year of finale (null if still airing)       | Yes      |
    | duration             | integer                 | Episode runtime in minutes                  | Yes      |
    | content_rating       | string                  | TV rating (e.g., "tv_14", "tv_ma", "tv_pg") | Yes      |
    | filming_location     | string                  | Primary filming location                    | Yes      |
    | production_companies | array of strings        | Production company names                    | Yes      |
    | country_of_origin    | array of strings        | Countries of origin                         | Yes      |
    | external_links       | array of strings (URLs) | Official and streaming links                | Yes      |
    | popularity           | float (0–1)             | Normalized popularity score                 | No       |
    | affinity             | float (0–1)             | Affinity score relative to input            | No       |
    | audience_growth      | float                   | Audience growth signal                      | Yes      |
    | disambiguation       | string                  | Premiere and finale years                   | Yes      |
    | tags                 | array of objects        | Genre and keyword tags                      | Yes      |

    ### Canonical JSON Example

    Example request: TV Shows, in-domain, input entity _Breaking Bad_. Example response entity: _Better Call Saul_ (most directly connected to the input, with rich metadata, affinity: 0.873).

    ```json
    {
      "entity_id": "C0FABEA5-D59D-4B63-B193-6636F61FBD67",
      "type": "urn:entity",
      "subtype": "urn:entity:tv_show",
      "name": "Better Call Saul",
      "description": "The trials and tribulations of criminal lawyer Jimmy McGill in the years leading up to his fateful run-in with Walter White and Jesse Pinkman.",
      "short_description": "A struggling lawyer navigates moral dilemmas and criminal cases, transforming into a morally ambiguous attorney amid a dangerous underworld.",
      "url": "https://images.qloo.com/i/C0FABEA5-D59D-4B63-B193-6636F61FBD67-420x-auto.jpg",
      "release_date": "2015-02-08",
      "release_year": 2015,
      "finale_year": 2022,
      "duration": 45,
      "content_rating": "TV-MA",
      "filming_location": "Albuquerque, New Mexico, USA",
      "production_companies": ["High Bridge Productions", "Crystal Diner Productions", "Gran Via Productions"],
      "country_of_origin": ["United States"],
      "external_links": [
        "https://www.instagram.com/bettercallsaulamc/",
        "https://www.facebook.com/BetterCallSaulAMC"
      ],
      "popularity": 0.9995712524786966,
      "affinity": 0.873018069670149,
      "audience_growth": 0,
      "disambiguation": "2015, 2022",
      "tags": [
        { "id": "urn:tag:keyword:media:drug_cartel", "name": "drug cartel", "type": "urn:tag:keyword:media" },
        { "id": "urn:tag:keyword:media:attorney", "name": "attorney", "type": "urn:tag:keyword:media" },
        { "id": "urn:tag:keyword:media:prequel_television_series", "name": "prequel television series", "type": "urn:tag:keyword:media" },
        { "id": "urn:tag:keyword:media:criminal", "name": "criminal", "type": "urn:tag:keyword:media" }
      ]
    }
    ```

    ### Cross-Domain Comparison

    Input entity: `target`, queried across all entity types.

    **Cross-Domain Results (TV Shows, Input: Target)**

    | TV Show              | Years     | Content Rating | Affinity |
    | -------------------- | --------- | -------------- | -------- |
    | _Superstore_         | 2015–2021 | TV-14          | 0.973    |
    | _Great News_         | 2017–2018 | TV-14          | 0.930    |
    | _The Mindy Project_  | 2012–2017 | TV-14          | 0.928    |
    | _Schitt's Creek_     | 2015–2020 | TV-14          | 0.921    |
    | _Fresh Off the Boat_ | 2015–2020 | TV-PG          | 0.912    |
    | _Jane the Virgin_    | 2014–2019 | TV-PG          | 0.910    |

    Results skew toward workplace comedies and family sitcoms, mainstream, broadcast-friendly shows with broad demographic appeal.

    **In-Domain Results (TV Shows, Input: Breaking Bad)**

    | TV Show            | Years     | Content Rating | Affinity |
    | ------------------ | --------- | -------------- | -------- |
    | _Prison Break_     | 2005–2017 | TV-14          | 0.887    |
    | _Better Call Saul_ | 2015–2022 | TV-MA          | 0.873    |
    | _The Sopranos_     | 1999–2007 | TV-MA          | 0.873    |
    | _Sons of Anarchy_  | 2008–2014 | TV-MA          | 0.860    |
    | _True Detective_   | 2014–     | TV-MA          | 0.851    |
    | _Fargo_            | 2014–2024 | TV-MA          | 0.847    |

    A broad commercial input (Target) surfaces light, family-friendly workplace comedies. A prestige-drama input (_Breaking Bad_) surfaces morally complex, cable-era TV-MA narratives. The same entity type returns distinctly different taste neighborhoods depending on the input entity's cultural positioning.

  </Tab>

  <Tab title="Video Games">
    # Video Games

    The Video Games entity type covers game titles across all platforms, genres, and release eras. Entities represent individual game releases or editions.

    ### Common Use Cases

    - Game recommendation and discovery
    - Audience taste profiling based on gaming preferences
    - Cross-domain analysis (e.g., identifying which brands or music align with a given game's fan base)

    ### Taxonomy

    <Callout icon="🎮" theme="info">
      ### Taxonomy Structure

      Video games use `urn:tag:genre:media` genre tags alongside `urn:tag:wikipedia_category:wikidata` tags for platform and category classification.
    </Callout>

    **Genre Tags**

    | Tag name                      | URN                                                 |
    | ----------------------------- | --------------------------------------------------- |
    | 2D Fighting                   | `urn:tag:genre:media:2d_fighting`                   |
    | 2D Platformer                 | `urn:tag:genre:media:2d_platformer`                 |
    | Arcade                        | `urn:tag:genre:media:arcade`                        |
    | FPS                           | `urn:tag:genre:media:fps`                           |
    | MOBA                          | `urn:tag:genre:media:moba`                          |
    | MMORPG                        | `urn:tag:genre:media:mmorpg`                        |
    | Open-World Action             | `urn:tag:genre:media:open_world_action`             |
    | Platformer                    | `urn:tag:genre:media:platformer`                    |
    | Puzzle                        | `urn:tag:genre:media:puzzle`                        |
    | Racing                        | `urn:tag:genre:media:racing`                        |
    | Rhythm                        | `urn:tag:genre:media:rhythm`                        |
    | Role-Playing                  | `urn:tag:genre:media:role_playing`                  |
    | Sandbox                       | `urn:tag:genre:media:sandbox`                       |
    | Shooter                       | `urn:tag:genre:media:shooter`                       |
    | Simulation                    | `urn:tag:genre:media:simulation`                    |
    | Soccer                        | `urn:tag:genre:media:soccer`                        |
    | Strategy                      | `urn:tag:genre:media:strategy`                      |
    | Survival                      | `urn:tag:genre:media:survival`                      |
    | Tactical FPS                  | `urn:tag:genre:media:tactical_fps`                  |
    | Tactical Third Person Shooter | `urn:tag:genre:media:tactical_third_person_shooter` |
    | Top-Down Shoot-Em-Up          | `urn:tag:genre:media:top_down_shoot_em_up`          |

    **Wikipedia Category Tags**

    | Tag name                                      | URN                                                                                 |
    | --------------------------------------------- | ----------------------------------------------------------------------------------- |
    | 2005 Video Games                              | `urn:tag:wikipedia_category:wikidata:2005_video_games`                              |
    | 2018 Video Games                              | `urn:tag:wikipedia_category:wikidata:2018_video_games`                              |
    | 2020 Video Games                              | `urn:tag:wikipedia_category:wikidata:2020_video_games`                              |
    | Among Us                                      | `urn:tag:wikipedia_category:wikidata:among_us`                                      |
    | Android Games                                 | `urn:tag:wikipedia_category:wikidata:android_operating_system_games`                |
    | Apex Legends                                  | `urn:tag:wikipedia_category:wikidata:apex_legends`                                  |
    | Asymmetrical Multiplayer Video Games          | `urn:tag:wikipedia_category:wikidata:asymmetrical_multiplayer_video_games`          |
    | Battle Royale Games                           | `urn:tag:wikipedia_category:wikidata:battle_royale_games`                           |
    | Counter-Strike                                | `urn:tag:wikipedia_category:wikidata:counter_strike`                                |
    | Esports Games                                 | `urn:tag:wikipedia_category:wikidata:esports_games`                                 |
    | First-Person Shooter Multiplayer Online Games | `urn:tag:wikipedia_category:wikidata:first_person_shooter_multiplayer_online_games` |
    | First-Person Shooters                         | `urn:tag:wikipedia_category:wikidata:first_person_shooters`                         |
    | Free Online Games                             | `urn:tag:wikipedia_category:wikidata:free_online_games`                             |
    | GoldSrc Games                                 | `urn:tag:wikipedia_category:wikidata:goldsrc_games`                                 |
    | iOS Games                                     | `urn:tag:wikipedia_category:wikidata:ios_games`                                     |
    | Linux Games                                   | `urn:tag:wikipedia_category:wikidata:linux_games`                                   |
    | Lua Scripted Video Games                      | `urn:tag:wikipedia_category:wikidata:lua_programming_language_scripted_video_games` |
    | macOS Games                                   | `urn:tag:wikipedia_category:wikidata:macos_games`                                   |
    | Multiplayer Online Games                      | `urn:tag:wikipedia_category:wikidata:multiplayer_online_games`                      |
    | Multiplayer Video Games                       | `urn:tag:wikipedia_category:wikidata:multiplayer_video_games`                       |
    | One-Button Video Games                        | `urn:tag:wikipedia_category:wikidata:one_button_video_games`                        |
    | PlayStation 4 Games                           | `urn:tag:wikipedia_category:wikidata:playstation_4_games`                           |
    | PlayStation 5 Games                           | `urn:tag:wikipedia_category:wikidata:playstation_5_games`                           |
    | Post-Apocalyptic Video Games                  | `urn:tag:wikipedia_category:wikidata:post_apocalyptic_video_games`                  |
    | Shooter Games                                 | `urn:tag:wikipedia_category:wikidata:shooter_games`                                 |
    | Single-Player Video Games                     | `urn:tag:wikipedia_category:wikidata:single_player_video_games`                     |
    | Source Engine Games                           | `urn:tag:wikipedia_category:wikidata:source_game_engine_games`                      |
    | Team Fortress                                 | `urn:tag:wikipedia_category:wikidata:team_fortress`                                 |
    | Titanfall                                     | `urn:tag:wikipedia_category:wikidata:titanfall`                                     |
    | Unreal Engine 3 Games                         | `urn:tag:wikipedia_category:wikidata:unreal_engine_3_games`                         |
    | Unreal Engine 4 Games                         | `urn:tag:wikipedia_category:wikidata:unreal_engine_4_games`                         |
    | Valve Corporation Games                       | `urn:tag:wikipedia_category:wikidata:valve_corporation_games`                       |
    | Video Game Development Software               | `urn:tag:wikipedia_category:wikidata:video_game_development_software`               |
    | Video Game Remakes                            | `urn:tag:wikipedia_category:wikidata:video_game_remakes`                            |
    | Video Game Sequels                            | `urn:tag:wikipedia_category:wikidata:video_game_sequels`                            |
    | Video Games About Special Air Service         | `urn:tag:wikipedia_category:wikidata:video_games_about_special_air_service`         |
    | Video Games Developed in Finland              | `urn:tag:wikipedia_category:wikidata:video_games_developed_in_finland`              |
    | Video Games Developed in United States        | `urn:tag:wikipedia_category:wikidata:video_games_developed_in_united_states`        |
    | Video Games Set in 2020s                      | `urn:tag:wikipedia_category:wikidata:video_games_set_in_2020s`                      |
    | Video Games With Cross-Platform Play          | `urn:tag:wikipedia_category:wikidata:video_games_cross_platform_play`               |
    | Video Games With Steam Workshop Support       | `urn:tag:wikipedia_category:wikidata:video_games_steam_workshop_support`            |
    | Windows Games                                 | `urn:tag:wikipedia_category:wikidata:windows_games`                                 |
    | Xbox Series X and Series S Games              | `urn:tag:wikipedia_category:wikidata:xbox_series_x_series_s_games`                  |
    | 2020s Fads and Trends                         | `urn:tag:wikipedia_category:wikidata:2020s_fads_trends`                             |

    ### Schema Reference

    | Field              | Type                          | Description                                            | Nullable |
    | ------------------ | ----------------------------- | ------------------------------------------------------ | -------- |
    | entity_id          | string (UUID)                 | Unique identifier                                      | No       |
    | type               | string                        | Always "urn:entity"                                    | No       |
    | subtype            | string                        | Always "urn:entity:videogame"                          | No       |
    | name               | string                        | Game title                                             | No       |
    | description        | string                        | Game description                                       | Yes      |
    | short_description  | string                        | Brief game summary                                     | Yes      |
    | url                | string (URL)                  | Qloo image URL                                         | Yes      |
    | slug               | string                        | URL-friendly game identifier                           | Yes      |
    | developer          | string                        | Development studio                                     | Yes      |
    | publisher          | string                        | Publisher name                                         | Yes      |
    | platforms          | string (JSON array in string) | Platforms the game is available on                     | Yes      |
    | release_date       | string (ISO date)             | Release date                                           | Yes      |
    | release_year       | integer                       | Release year                                           | Yes      |
    | content_rating     | string                        | ESRB rating (e.g., "e", "t", "m")                      | Yes      |
    | media_franchise    | —                             | Franchise association (present if part of a franchise) | Yes      |
    | qloo_franchise_id  | integer                       | Internal franchise identifier                          | Yes      |
    | franchise_series   | array of strings              | Named franchise/series associations                    | Yes      |
    | has_part           | —                             | Indicates game has downloadable content or expansions  | Yes      |
    | part_of_the_series | —                             | Indicates game is part of a named series               | Yes      |
    | akas               | array of strings              | Alternative names                                      | Yes      |
    | popularity         | float (0–1)                   | Normalized popularity score                            | No       |
    | affinity           | float (0–1)                   | Affinity score relative to input                       | No       |
    | disambiguation     | string                        | Release date and developer for disambiguation          | Yes      |
    | tags               | array of objects              | Genre and Wikipedia category tags                      | Yes      |

    ### Canonical JSON Example

    Example request: Video Games, in-domain, input entity _Minecraft_. Example response entity: _Terraria_ (most data-rich sandbox game result with a complete schema, affinity: 0.850).

    ```json
    {
      "entity_id": "FE25ADF3-767A-405B-9DC3-69D52BC8C185",
      "type": "urn:entity",
      "subtype": "urn:entity:videogame",
      "name": "Terraria",
      "description": "Terraria offers players a chance to be an action gamer, master builder, a collector, and even an explorer.",
      "url": "https://images.qloo.com/i/FE25ADF3-767A-405B-9DC3-69D52BC8C185-420x-auto.jpg",
      "slug": "terraria",
      "developer": "Engine Software",
      "publisher": "505 Games",
      "platforms": "[PlayStation 3, PC, Xbox 360, PlayStation Vita, iOS (iPhone/iPad), PlayStation 4, Xbox One, 3DS, Wii U, Nintendo Switch]",
      "release_date": "2013-03-27",
      "release_year": 2013,
      "content_rating": "T",
      "popularity": 0.9840648588202404,
      "affinity": 0.8498194096311231,
      "disambiguation": "2013-03-27, Engine Software",
      "tags": [
        { "id": "urn:tag:genre:media:sandbox", "name": "Sandbox", "type": "urn:tag:genre:media" },
        { "id": "urn:tag:wikipedia_category:wikidata:video_games_cross_platform_play", "name": "Video Games With Cross-platform Play", "type": "urn:tag:wikipedia_category:wikidata" },
        { "id": "urn:tag:wikipedia_category:wikidata:xbox_one_games", "name": "Xbox One Games", "type": "urn:tag:wikipedia_category:wikidata" }
      ]
    }
    ```

    ### Cross-Domain Comparison

    Input entity: `target`, queried across all entity types.

    **Cross-Domain Results (Video Games, Input: Target)**

    | Video Game                         | Genre                         | Developer                 | Affinity |
    | ---------------------------------- | ----------------------------- | ------------------------- | -------- |
    | _Counter-Strike: Global Offensive_ | Tactical FPS                  | Hidden Path Entertainment | 0.906    |
    | _PlayerUnknown's Battlegrounds_    | Tactical FPS                  | PUBG Corporation          | 0.902    |
    | _Valorant_                         | Tactical FPS                  | Riot Games                | 0.892    |
    | _Apex Legends_                     | Tactical FPS                  | Respawn Entertainment     | 0.879    |
    | _Team Fortress 2_                  | Tactical FPS                  | Valve Software            | 0.873    |
    | _Fortnite_                         | Tactical Third Person Shooter | Epic Games                | 0.846    |

    Results skew toward tactical multiplayer and team-based shooters, PC-focused titles with broad competitive appeal and a mainstream young-adult gaming audience.

    **In-Domain Results (Video Games, Input: Minecraft)**

    | Video Game                  | Genre   | Developer          | Affinity |
    | --------------------------- | ------- | ------------------ | -------- |
    | _Minecraft: Pocket Edition_ | Sandbox | Mojang AB          | 0.879    |
    | _Garry's Mod_               | Sandbox | Facepunch Studios  | 0.863    |
    | _ROBLOX_                    | Sandbox | ROBLOX, Inc.       | 0.862    |
    | _Terraria_                  | Sandbox | Engine Software    | 0.850    |
    | _Unturned_                  | Sandbox | Nelson Sexton      | 0.845    |
    | _Don't Starve_              | Sandbox | Klei Entertainment | 0.814    |

    A competitive multiplayer input (Target) surfaces session-based shooters with spectator culture. An open-ended creative input (_Minecraft_) surfaces sandbox games that prioritize exploration and player-driven building over competitive play. The Video Games entity type cleanly separates competitive and creative gaming taste profiles.

  </Tab>
</Tabs>
