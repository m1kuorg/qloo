# Capabilities

Every capability draws on the same proprietary cultural ontology and taste intelligence. Use one or combine all six.

Contents:

1.  [Cultural data enrichment](#cultural-data-enrichment)
    1.  [Describe more than the basics](#describe-more-than-the-basics)
    1.  [Put relationships to work](#put-relationships-to-work)
    1.  [Define the scope around your use case](#define-the-scope-around-your-use-case)
1.  [Taste intelligence](#taste-intelligence)
    1.  [Describe the context](#describe-the-context)
    1.  [Predict beyond the inputs](#predict-beyond-the-inputs)
    1.  [Reconsider the whole combination](#reconsider-the-whole-combination)
1.  [Recommendations](#recommendations)
    1.  [Start with what you know](#start-with-what-you-know)
    1.  [Cross the category boundary](#cross-the-category-boundary)
    1.  [Rank for the context](#rank-for-the-context)
1.  [Locality intelligence](#locality-intelligence)
    1.  [Work at the scale of the question](#work-at-the-scale-of-the-question)
    1.  [Connect taste to location](#connect-taste-to-location)
    1.  [Make local discovery more relevant](#make-local-discovery-more-relevant)
1.  [AI & agent grounding](#ai--agent-grounding)
    1.  [A factual database, one call deep](#a-factual-database-one-call-deep)
    1.  [Ranked for the person, not just the query](#ranked-for-the-person-not-just-the-query)
    1.  [Know the person beyond the instructions](#know-the-person-beyond-the-instructions)
    1.  [Benefits that compound per request](#benefits-that-compound-per-request)
    1.  [A real-world reference for generated answers](#a-real-world-reference-for-generated-answers)
    1.  [Preferences as context for action](#preferences-as-context-for-action)
    1.  [Work alongside your models](#work-alongside-your-models)
1.  [On-device intelligence](#on-device-intelligence)
    1.  [Local processing for supported tasks](#local-processing-for-supported-tasks)
    1.  [An extension of the same foundation](#an-extension-of-the-same-foundation)
    1.  [Shaped to the experience](#shaped-to-the-experience)
1.  [Six capabilities, one system](#six-capabilities-one-system)
1.  [See also](#see-also)

## Cultural data enrichment

Give your data cultural context.

Resolve your own records against Qloo's entities and attach the structured attributes, signals, and relationships that sit behind them.

One record, before and after (+8 fields):

- Your record:
  - name: I Sodi
  - address: 314 Bleecker St New York, NY 10014
  - category: Restaurant
  - internal_id: VEN-40817
- Resolved and enriched:
  - Resolved entity: I Sodi
  - Attributes: category Italian, Tuscan restaurant; known for Tiramisu, Pan fried pork chop with lemon, Cacio e pepe; ambience Gastronomic, Elegant, Understated
  - Signal: popularity 4.2 average rating; neighborhood West Village
  - Relationships: in-domain Via Carota, Don Angie, Loring Place; cross-domain Warby Parker, New Haven, Flor de Toloache

Four fields. Enough to store a venue, not enough to reason about it. Resolved and enriched from Qloo's real data. Scope the fields to the use: attributes only, or attributes with relationships and signal.

### Describe more than the basics

Add cultural characteristics alongside factual details, so a record carries what a thing is like as well as what it is.

### Put relationships to work

Bring relevant cultural connections into the way your product organizes and presents information. Connect the dots you already hold to the ones you do not.

### Define the scope around your use case

Work with what is useful: the entities, attributes, and delivery that fit the systems you already run, through an API or a managed feed.

## Taste intelligence

Understand the combination. Infer beyond it.

Turn a place, brand, or combination of interests into structured cultural context. Explore what defines it and which additional affinities it suggests.

Combine interests. See the picture change. Example interests: I Sodi, Jil Sander, Brian Eno, Tyler, the Creator.

- Descriptive taste, what defines this combination: An appetite for New American cooking pairs with a taste for German Literature, both drawn to clean lines beneath surface warmth. That same clarity carries into minimalist tailoring and the pulse of new wave sound, favoring form stripped to essentials.
- Predictive taste, what else this combination points to: The same appetite reaches 11 Howard and Brooklyn, while its restless edge answers to the sound of Arca. It also inclines toward Vetements cut and the narrative pull of The Square, each read as evidence of one continuous curiosity.

Same combination, same read, every time.

### Describe the context

Surface the cultural qualities represented by the selected entities. Understand their similarities, distinctions, and contrasts without reducing every combination to a single aesthetic.

### Predict beyond the inputs

Infer additional interests and cultural attributes within and across categories. Move from the context you already have to possibilities that are not yet in view.

### Reconsider the whole combination

One interest can point in a direction. A richer combination narrows it: each addition re-reads the whole, rather than stacking on the last answer.

## Recommendations

Discovery that connects across categories.

Start from a single interest or a detailed combination, and surface what fits across dining, travel, entertainment, brands, and place.

One interest in. Five categories out. Example input: Brian Eno, music artist.

| Category    | Recommendation                                | Score |
| ----------- | --------------------------------------------- | ----- |
| Hotel       | Villa Lena                                    | 0.91  |
| Restaurant  | Rathbone Place                                | 0.91  |
| Destination | Canterbury                                    | 0.93  |
| Book        | Ziggyology: A Brief History Of Ziggy Stardust | 0.92  |
| Film        | Enter the Void                                | 0.93  |

One affinity query per category, ranked against the same input across all five.

### Start with what you know

A single signal is enough to begin. A fuller combination sharpens the ranking, but nothing waits on a profile or a history.

### Cross the category boundary

Most engines stay inside one catalog. Qloo carries an affinity from music to hotels, or from fashion to dining, and can show the attributes that carried it.

### Rank for the context

The same candidates order differently for a different moment, place, or combination. Ranking reflects the request rather than a fixed popularity list.

## Locality intelligence

Understand a place beyond its coordinates.

A place is more than a named geography. Explore the character of a locality, compare places across scales, and see which tastes concentrate where.

Reads at this scale, around a point in Harlem:

| Tag              | Concentration index |
| ---------------- | ------------------- |
| Lounge           | 100                 |
| Bar              | 94                  |
| Brunch           | 90                  |
| Live music venue | 90                  |
| American         | 89                  |

Concentration index, 0–100 - each row's place among the 20 tags fetched at this scale, rescaled. Not a share and not a count.

At block scale the read is specific to a few hundred metres: the genres that concentrate around one address, and where restaurant affinity peaks within that radius.

Every hex reads restaurant affinity, the signal Qloo's heatmap endpoint requires (`urn:tag:genre:place:restaurant`). The tilt is mild - swapping the signal for museums keeps three of the top five cells.

### Work at the scale of the question

A block, a neighborhood, a metro, a country. The same structured read applies at every scale, so a question about a corner and a question about a market get the same treatment.

### Connect taste to location

A request does not always specify everything that matters. Qloo can interpret a combination of interests and location together to rank what fits the context it has been given.

### Make local discovery more relevant

Rank nearby inventory by cultural fit rather than distance alone, so what surfaces first is what suits the place and the person asking.

## AI & agent grounding

Ground the answer. Inform the action.

Qloo is a partner to the model API, not a chat product. It grounds language models and agents in two things at once, the facts of the world and the taste of the person, delivered as one structured call at the scale a product runs.

### A factual database, one call deep

Hundreds of millions of places, brands, titles, and artists with hours, location, category, and attributes. A request filters that whole set in one pass, instead of a model probing websites one page at a time.

```text
filter.type = place
filter.location = copenhagen · 3 km
filter.tags = restaurant
```

Result: 500+ venues. 419 of 500 counted carry hours · 500 of 500 carry a location.

### Ranked for the person, not just the query

The request says _restaurant_. The person’s interests say _Jil Sander, Brian Eno_. Qloo ranks the qualified venues by what those interests point to, even though neither has anything to do with restaurants.

```text
signal.interests = jil-sander, brian-eno
```

1. Aoc, 0.90: Sophisticated · Gastronomic
2. MASH Penthouse | København, 0.89: Gastronomic · Buzzing
3. Istid, 0.86: Lively · Interactive

Each venue’s own attributes, as many as fit, shown for context.

### Know the person beyond the instructions

An agent acting on someone’s behalf has to understand the person, the context, and the instructions, not the instructions alone. Qloo supplies the person’s taste as structured context, with no identity attached, so the agent’s choices stay aligned with who it is acting for.

- Instructions: “Book me dinner tonight”
- Context: Copenhagen · 19:00 · one night
- Taste, from Qloo: restraint · counter-service · ambient
- Action: Reserve Kadeau, counter, 19:30

Illustrative: a plausible agent flow, not a real reservation.

### Benefits that compound per request

The advantage is not one clever answer. It is what happens across millions of requests: one call instead of a crawl, an answer in milliseconds, and nothing stored about anyone. That is the difference between a feature and infrastructure.

- **1** request, not a crawl
- **~100 ms** facts and taste together
- **Static** example, generated once
- **0** identifiers, no profile stored

Illustrative figures for a supported flow, not measurements against live traffic.

### A real-world reference for generated answers

The model reasons over a set that already exists and already qualifies, drawn from real hours, location, and attribute data, rather than assembling one page by page.

### Preferences as context for action

A request rarely states everything that matters. Qloo turns the interests a person does have into a ranking an agent can act on, across categories the request never mentioned.

### Work alongside your models

Let the language model handle the conversation. Qloo handles the facts and the taste behind the choice, as a tool the model calls once.

## On-device intelligence

Personalization without the round trip.

Qloo's compact models run supported inference on the device itself, so a personal experience does not depend on sending context anywhere.

Same request, two paths:

- Cloud round trip, context leaves the device: serialize, network out, inference, network back. Leaves the device: **request payload**.
- On device, context never leaves. Leaves the device: **nothing**. Works offline: **on-device only**.

Network latency varies; the architectural difference does not.

### Local processing for supported tasks

Ranking, reordering, and affinity lookups run against a compact model held on the device, with no request to make and no network to wait for.

### An extension of the same foundation

Compact models draw on the same ontology and signals as the API, so what the device knows and what the service knows do not diverge.

### Shaped to the experience

Start with the inference task and target footprint, then size the model to it. Pair with the API when a request needs the full graph.

## Six capabilities, one system

What strengthens one strengthens the rest. A signal that sharpens recommendations sharpens grounding. An ontology deepened for enrichment deepens locality. This is why the six are one company and not a catalog.

## See also

- [Capabilities on qloo.com](https://www.qloo.com/capabilities), crawled 2026-10-16
- [Qloo overview](qloo-overview.md)
- [Contact](contact.md)
