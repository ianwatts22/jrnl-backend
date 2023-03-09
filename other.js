"use strict";
// ========================================================================================
// ======================================EMBEDDINGS========================================
// ========================================================================================
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
// /* embeddings
// import { PineconeClient } from '@pinecone-database/pinecone'
// const pinecone = new PineconeClient();
// ! initially had a top-level await but it was causing issues w/ TS, should figure out top-level await
// pinecone.init({ environment: "YOUR_ENVIRONMENT", apiKey: process.env.PINECONE_API_KEY! })
// async function embedding_test() {
//   const response = await openai.createEmbedding({
//     model: "text-embedding-ada-002",
//     input: "The food was delicious and the waiter...",
//   });
// }
// chrono is NLP that turns relative dates absolute
// import * as chrono from 'chrono-node'
// test_chrono()
// async function test_chrono() {
//   const parsed_date = chrono.parseDate('july')
//   console.log(parsed_date)
// } */
// // GPT Prisma query generation
function test_openAI_query(message) {
    return __awaiter(this, void 0, void 0, function* () {
        // https://platform.openai.com/playground/p/gs3gMaELFtvzh0Jdcg7fT2A5?model=text-davinci-003
        const extract_dates_prompt = `Extract the beginning and end times from the prompt below to help derive a search query. Do not modify the text, extract it as it is.
  Prompt: ${message}
  t0, t1: `;
        const query_prompt = `// You are a super-intelligent AI creating queries. Below is the shape of data for a message. Create a single Prisma ORM query based off the following prompt. Finish after the "const where" statement
  model messages {
    content        String?
    media_url      String?
    is_outbound    Boolean?
    date           DateTime @db.Date
    tokens         Int?
    keywords       String[]
    type           String?
    relevance      Int?
  }`;
        try {
            const extract_dates = yield openai.createCompletion({ model: 'text-davinci-003', prompt: extract_dates_prompt, max_tokens: 64, temperature: 0.3 });
            const query_text = yield openai.createCompletion({
                model: 'code-davinci-002', prompt: query_prompt, max_tokens: 128,
                temperature: 0.5, frequency_penalty: 0, presence_penalty: 0,
                stop: ['//'],
            });
            const where = JSON.parse(query_text.data.choices[0].text); //turn string into object to pass into Prisma query
            const query = yield prisma.messages.findMany({ where: where, orderBy: { relevance: "desc", }, take: 10, });
        }
        catch (e) {
            error_alert(e);
        }
    });
}
