[Skip to content](https://www.qloo.com/capabilities#main)

# Capabilities

Every capability draws on the same proprietary cultural ontology and taste intelligence. Use one or combine all six.

[Book a Demo→](https://www.qloo.com/book-a-demo)

One foundation

Six capabilities drawing on one foundationONE CULTURAL ONTOLOGY · ONE TASTE INTELLIGENCE [Cultural DataEnrichment](https://www.qloo.com/capabilities#enrichment) [Taste Intelligence](https://www.qloo.com/capabilities#taste) [Recommendations](https://www.qloo.com/capabilities#recommendations) [Locality Intelligence](https://www.qloo.com/capabilities#locality) [AI & AgentGrounding](https://www.qloo.com/capabilities#grounding) [On-Device Intelligence](https://www.qloo.com/capabilities#on-device)

01Cultural Data Enrichment

## Give your datacultural context.

Resolve your own records against Qloo's entities and attach the structured attributes, signals, and relationships that sit behind them.

[Add cultural understanding to your data→](https://www.qloo.com/book-a-demo)

One record, before and after+8 fields

Your record

nameI Sodi

address314 Bleecker St New York, NY 10014

categoryRestaurant

internal\_idVEN-40817

Four fields. Enough to store a venue, not enough to reason about it.

Resolved and enriched

Resolved

entityI Sodi

Attributes

categoryItalianTuscan restaurant

known forTiramisuPan fried pork chop with lemonCacio e pepe

ambienceGastronomicElegantUnderstated

Signal

popularity4.2 average rating

neighborhoodWest Village

Relationships

in-domainVia CarotaDon AngieLoring Place

cross-domainWarby ParkerNew HavenFlor de Toloache

Resolved and enriched from Qloo's real data. Scope the fields to the use: attributes only, or attributes with relationships and signal.entity resolution → enrichment

### Describe more than the basics

Add cultural characteristics alongside factual details, so a record carries what a thing is like as well as what it is.

### Put relationships to work

Bring relevant cultural connections into the way your product organizes and presents information. Connect the dots you already hold to the ones you do not.

### Define the scope around your use case

Work with what is useful: the entities, attributes, and delivery that fit the systems you already run, through an API or a managed feed.

02Taste Intelligence

## Understand the combination.Infer beyond it.

Turn a place, brand, or combination of interests into structured cultural context. Explore what defines it and which additional affinities it suggests.

[See what your context can reveal→](https://www.qloo.com/book-a-demo)

Combine interests. See the picture change.3 interests

I SodiJil SanderBrian EnoTyler, the Creator

Keep two interests selected. Add another before removing one.

Descriptive taste

What defines this combination

An appetite for New American cooking pairs with a taste for German Literature, both drawn to clean lines beneath surface warmth. That same clarity carries into minimalist tailoring and the pulse of new wave sound, favoring form stripped to essentials.

Predictive taste

What else this combination points to

The same appetite reaches 11 Howard and Brooklyn, while its restless edge answers to the sound of Arca. It also inclines toward Vetements cut and the narrative pull of The Square, each read as evidence of one continuous curiosity.

PlacesBrandsArtistsFilm & TVBooksSame combination, same read, every time.

### Describe the context

Surface the cultural qualities represented by the selected entities. Understand their similarities, distinctions, and contrasts without reducing every combination to a single aesthetic.

### Predict beyond the inputs

Infer additional interests and cultural attributes within and across categories. Move from the context you already have to possibilities that are not yet in view.

### Reconsider the whole combination

One interest can point in a direction. A richer combination narrows it: each addition re-reads the whole, rather than stacking on the last answer.

03Recommendations

## Discovery that connectsacross categories.

Start from a single interest or a detailed combination, and surface what fits across dining, travel, entertainment, brands, and place.

[Make discovery more relevant from the first interest→](https://www.qloo.com/book-a-demo)

One interest in. Five categories out.Brian EnoJil SanderTyler, the Creator

Brian Eno

Music artist

1. HotelVilla Lena0.91
2. RestaurantRathbone Place0.91
3. DestinationCanterbury0.93
4. BookZiggyology: A Brief History Of Ziggy Stardust0.92
5. FilmEnter the Void0.93

One affinity query per category, ranked against the same input across all five.cross-domain

### Start with what you know

A single signal is enough to begin. A fuller combination sharpens the ranking, but nothing waits on a profile or a history.

### Cross the category boundary

Most engines stay inside one catalog. Qloo carries an affinity from music to hotels, or from fashion to dining, and can show the attributes that carried it.

### Rank for the context

The same candidates order differently for a different moment, place, or combination. Ranking reflects the request rather than a fixed popularity list.

04Locality Intelligence

## Understand a placebeyond its coordinates.

A place is more than a named geography. Explore the character of a locality, compare places across scales, and see which tastes concentrate where.

[Bring cultural context to your map→](https://www.qloo.com/book-a-demo)

A pointA neighborhoodA city

Reads at this scale

Around a point · Harlem

Concentration index, 0–100 - each row's place among the 20 tags fetched at this scale, rescaled. The bar is the same figure. Not a share and not a count.

Lounge _100_

Bar _94_

Brunch _90_

Live music venue _90_

American _89_

At block scale the read is specific to a few hundred metres: the genres that concentrate around one address, and where restaurant affinity peaks within that radius.

Every hex reads restaurant affinity, the signal Qloo's heatmap endpoint requires (urn:tag:genre:place:restaurant). The tilt is mild - swapping the signal for museums keeps three of the top five cells.block → global

### Work at the scale of the question

A block, a neighborhood, a metro, a country. The same structured read applies at every scale, so a question about a corner and a question about a market get the same treatment.

### Connect taste to location

A request does not always specify everything that matters. Qloo can interpret a combination of interests and location together to rank what fits the context it has been given.

### Make local discovery more relevant

Rank nearby inventory by cultural fit rather than distance alone, so what surfaces first is what suits the place and the person asking.

05AI & Agent Grounding

## Ground the answer.Inform the action.

Qloo is a partner to the model API, not a chat product. It grounds language models and agents in two things at once, the facts of the world and the taste of the person, delivered as one structured call at the scale a product runs.

[Build AI around real-world relevance→](https://www.qloo.com/book-a-demo)

Facts

### A factual database, one call deep

Hundreds of millions of places, brands, titles, and artists with hours, location, category, and attributes. A request filters that whole set in one pass, instead of a model probing websites one page at a time.

filter.type = place

filter.location = copenhagen · 3 km

filter.tags = restaurant

↓

**500+ venues** 419 of 500 counted carry hours · 500 of 500 carry a location

Taste

### Ranked for the person, not just the query

The request says _restaurant_. The person’s interests say _Jil Sander, Brian Eno_. Qloo ranks the qualified venues by what those interests point to, even though neither has anything to do with restaurants.

signal.interests = jil-sander, brian-eno

↓

1. 1Aoc0.90Sophisticated · Gastronomic
2. 2MASH Penthouse \| København0.89Gastronomic · Buzzing
3. 3Istid0.86Lively · Interactive

Each venue’s own attributes, as many as fit, shown for context.

Agents

### Know the person beyond the instructions

An agent acting on someone’s behalf has to understand the person, the context, and the instructions, not the instructions alone. Qloo supplies the person’s taste as structured context, with no identity attached, so the agent’s choices stay aligned with who it is acting for.

Instructions“Book me dinner tonight”

ContextCopenhagen · 19:00 · one night

Taste, from Qloorestraint · counter-service · ambient

ActionReserve Kadeau, counter, 19:30

Illustrative: a plausible agent flow, not a real reservation.

Scale

### Benefits that compound per request

The advantage is not one clever answer. It is what happens across millions of requests: one call instead of a crawl, an answer in milliseconds, and nothing stored about anyone. That is the difference between a feature and infrastructure.

**1** request, not a crawl

**~100 ms** facts and taste together

**Static** example, generated once

**0** identifiers, no profile stored

Illustrative figures for a supported flow, not measurements against live traffic.

### A real-world reference for generated answers

The model reasons over a set that already exists and already qualifies, drawn from real hours, location, and attribute data, rather than assembling one page by page.

### Preferences as context for action

A request rarely states everything that matters. Qloo turns the interests a person does have into a ranking an agent can act on, across categories the request never mentioned.

### Work alongside your models

Let the language model handle the conversation. Qloo handles the facts and the taste behind the choice, as a tool the model calls once.

06On-Device Intelligence

## Personalization withoutthe round trip.

Qloo's compact models run supported inference on the device itself, so a personal experience does not depend on sending context anywhere.

[Explore on-device deployment→](https://www.qloo.com/book-a-demo)

Same request, two paths

Cloud round tripcontext leaves the device

serializenetwork outinferencenetwork back

-293 ms

On devicecontext never leaves

-292 ms

Leaves the device: **request payload**Leaves the device: **nothing**Works offline: **on-device only**

Illustrative timings for a supported ranking task. Network latency varies; the architectural difference does not.compact models

### Local processing for supported tasks

Ranking, reordering, and affinity lookups run against a compact model held on the device, with no request to make and no network to wait for.

### An extension of the same foundation

Compact models draw on the same ontology and signals as the API, so what the device knows and what the service knows do not diverge.

### Shaped to the experience

Start with the inference task and target footprint, then size the model to it. Pair with the API when a request needs the full graph.

## Six capabilities, one system. What strengthens one strengthens the rest.

A signal that sharpens recommendations sharpens grounding. An ontology deepened for enrichment deepens locality. This is why the six are one company and not a catalog.

## See what Qloo knows about your world.

Schedule time with our team, to talk to sales engineering about methodology, evaluation, and integration.

[Book a Demo→](https://www.qloo.com/book-a-demo)
