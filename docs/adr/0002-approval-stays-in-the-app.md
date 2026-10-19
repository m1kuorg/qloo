# Approval stays in the app

Only a signed-in member, in the app, can approve an insertion order or a reply. The API, the SDK, and the MCP server, which all act through an API key, can import a roster, start runs, answer the agent's questions, and edit drafts, but they have no approve action, and they can export an insertion order only once a member has approved it. An API key is held by a program that may run unattended, so giving it approval would let a plan or an email ship without a person, which [PRODUCT.md](/docs/PRODUCT.md#product-principles) rules out.
