"use strict";
// ========================================================================================
// =======================================CHAT=============================================
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
// ! adjust model
/* async function model_adjust(message: Message, user: User) {
  if (user?.model != null) model = user.model
  if (user?.temp != null) temp = user.temp.toNumber()
  if (user?.pres != null) pres = user.pres.toNumber()
  if (user?.freq != null) freq = user.freq.toNumber()
} */
// ! CHAT
/* if (model == 'chat') {
  // get messages user reacted to with love or emphasize
  const reacted_messages = await prisma.message.findMany({ where: { number: message.number, reactions: { hasSome: ["Loved", "Emphasized"] } }, orderBy: { date: "desc" }, take: 5 })

  // get messages preceding reacted messages
  const reacted_messages_prompts = await Promise.all(reacted_messages.map(async (message: Message) => {
    try {
      return await prisma.message.findFirstOrThrow({ where: { number: message.number, id: message.id - 1 } })
    } catch (e) { return message }
  }))
  // combine prompts and messages
  let reacted_messages_with_prompts = reacted_messages_prompts.flatMap((value, index) => [value, reacted_messages[index]])

  const reacted_messages_formatted: ChatCompletionRequestMessage[] = reacted_messages_with_prompts.map((message: Message) => { return { role: 'system', name: message.is_outbound ? 'example_assistant' : 'example_user', content: `[${message.date!.toLocaleString("en-US", message_date_format)}] ${message.content}` } })

  let previous_messages = await get_previous_messages(message, 20, true)

  const previous_messages_array: ChatCompletionRequestMessage[] = previous_messages.map((message: Message) => { return { role: message.is_outbound ? "assistant" : "user", content: `[${message.date?.toLocaleString("en-US", message_date_format)}] ${message.content}` } })

  let prompt: ChatCompletionRequestMessage[] = [{ role: 'system', content: init_prompt }]
  prompt = prompt.concat(reacted_messages_formatted, previous_messages_array, [{ role: 'user', content: message.content! }])

  const completion = await openai.createChatCompletion({ max_tokens: 2048, model: 'gpt-3.5-turbo', temperature: temp, presence_penalty: pres, frequency_penalty: freq, messages: prompt, })
  let completion_string = completion.data.choices[0].message!.content
  // console.log(completion.data)

  if (completion_string.includes('M]')) completion_string = completion_string.split('M] ')[1]  // remove date from completion

  await send_message({ ...default_message, content: completion_string, number: message.number, tokens: message.tokens })

} */
// ! CATEGORIZE
/* const previous_messages = await get_previous_messages(message, 6, true)
      let prompt: ChatCompletionRequestMessage[] = [
        { role: 'system', content: `You are part of an AI journaling chatbot. To determine which function to run next, categorize the users intent into one of the following: ${categories}.  Customer support is ONLY for people asking specifically about how the service works.` },
        { role: 'system', name: 'example_user', content: 'text: I need help planning my day' },
        { role: 'system', name: 'example_assistant', content: 'category: discuss' },
        { role: 'system', name: 'example_user', content: `text: what's my bio` },
        { role: 'system', name: 'example_assistant', content: 'category: update_profile' },
        { role: 'system', name: 'example_user', content: `text: change my hometown to Ann Arbor` },
        { role: 'system', name: 'example_assistant', content: 'crategory: update_profile' },
        { role: 'system', name: 'example_user', content: `text: how does this app work` },
        { role: 'system', name: 'example_assistant', content: 'category: customer_support' },
      ]
      // prompt = prompt.concat(previous_messages) // ? does this do more harm than good?
      prompt = prompt.concat([{ role: 'user', content: `text: ${message.content!}` }])
      console.log(prompt)
      const completion = await openai.createChatCompletion({ model: 'gpt-3.5-turbo', temperature: 0.1, messages: prompt, n: 4 })
      return completion.data.choices[0].message!.content.split(':')[1].toLowerCase().replace(/\s/g, '') */
// UPDATE PROFILE
/* let prompt: ChatCompletionRequestMessage[] = [
      { role: 'system', content: `Below is a message from the user along with their bio. We believe they want to view their existing bio or update it. First determine their intent (view or update), then return either their existing or updated bio. If their bio is blank, put "empty". Previous messages are included which may help. Condense the information, remove extraneous words. Replace many words with few. Group relevant information. Separate disparate information with new lines. Format the bio like the following example, extracting the key words from the message.` },
      { role: 'system', name: 'example_user', content: 'I went to the University of Michigan where I studied mechanical engineering and was in fraternity' },
      { role: 'system', name: 'example_assistant', content: `<previous bio>\n- University of Michigan: studied mechanical engineering, in fraternity` },
      { role: 'user', content: message.content! },
    ]
    const previous_messages = await get_previous_messages(message, 20)
 
    const completion = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo', temperature: 0.3, max_tokens: 512, presence_penalty: 2.0, frequency_penalty: 2.0,
      messages: prompt.concat(previous_messages),
    }) */
// ========================================================================================
// ======================================EMBEDDINGS========================================
// ========================================================================================
// 
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
// }
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
// ========================================================================================
// ========================================OTHER+==========================================
// ========================================================================================
// ! QUOTE TXT TO ARRAY
const quotesText = fs.readFileSync('other/quotes.txt', 'utf8');
const quotesArray = quotesText.split('\n\n').map((quote) => quote.trim());
const quotesWrappedAndIndented = quotesArray.map((quote) => `\`${quote.replace(/\n\s+/g, '\n')}\``).join(', ');
console.log(quotesWrappedAndIndented);
