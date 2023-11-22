# jrnl

jrnl is an iMessage journaling chatbot for conversational journlaing in the messaging interface we use every day. The system prompt includes a bio and other demographic information you enter in the signup form, which makes it speak in a relatable manner. It also includes some principles and directions to help you get ideas out of your head and break them down into achieveable actions you can take immediately. It has the previous 20 messages as context, including the date and time for context. We are working on recursive summarization as well, to give provide context from earlier messages while minimizing token usage and irrelevant infomration.

You can tapback on messages
- messages you "Love" will be used in the example messages as lightweight RLHF, tailoring the responses towards messages you love.
- when you question or emphasize, it will clarify or continue respectively

## ChatGPT prompt

Project: iMessage journaling chatbot service called "jrnl". It is meant to make it easier for people to journal by providing a conversational interface.
Technology: Typescript Node.js app using Express and Axios, Sendblue API for texting, Tally.so for signup form, Prisma for ORM with PostreSQL database, web service and database hosted on Render.com, Stripe for payments (syncs to db automatically)
Experience: Been developing web apps for a few months. Have done multiple projects with this stack.
Principles: Simplicity, speed, ease of use, deep connection, privacy.

## tech stack

[chrono](https://github.com/wanasit/chrono): natural language date parser
[Pinecone vector db](https://docs.pinecone.io/docs/node-client)

- [OpenAI](https://docs.pinecone.io/docs/openai)
