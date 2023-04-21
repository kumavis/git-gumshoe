langchain improvements:
- system should have mechanism for Documents composed of fragments, so that it understands the origin document of a fragment and so that it can summarize a document by composing a summary of fragments
- should provide a debugging utility for tracing how chains create tasks
- how to cache requests to disk?
- azure support requires specifying the deployment in the url which depends on the model
- document loader should specify a splitter

to explore:
- agents / tools
- mvp: git commit history summarization
- js ast splitting

to do:
- azure support for embeddings / variable models
- request caching
- try out
  - [ ] StuffDocumentsChain
  - [ ] MapReduceDocumentsChain
  - [ ] RefineDocumentsChain
  - [ ] loadSummarizationChain
  - [ ] ConversationalRetrievalQAChain
