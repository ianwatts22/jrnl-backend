// ========================================================================================
// =======================================TEXT=============================================
// ========================================================================================

// in get_previous_messages
/* if (chat) {
  const previous_messages_chat: ChatCompletionRequestMessage[] = previous_messages.map((message: Message) => { return { role: message.is_outbound ? "assistant" : "user", content: `[${message.date?.toLocaleString("en-US", message_date_format)}] ${message.content}` } })
  return previous_messages_chat as any
} else {
  const previous_messages_string: string[] = previous_messages.map((message: Message) => { return `\n[${message.date?.toLocaleString('en-US', message_date_format)}] ${message.is_outbound ? 'Journal:' : 'Human: '} ${message.content}` })
  return previous_messages_string as any
  return previous_messages as any
} */

/* else if (message.content.startsWith('m:') && admin_numbers.includes(message.number)) {
  const modelText = message.content.trim().toLowerCase().split('m:').pop()

  // Check if the modelText is a valid enum value
  if (Object.values(Model).includes(modelText as Model)) {
    const model = modelText as Model;

    await prisma.user.update({ where: { number: message.number }, data: { model } });
    await send_message({ ...default_response, content: `${model} activated` });
    return;
  } else {
    await send_message({ ...default_response, content: `Invalid model. Valid models are: ${Object.values(Model).join(', ')}Respond with "m:*model*".` }); return
  }
}  */

/* if (model == Model.text) {
  const previous_messages_string = previous_messages.map((message: Message) => { return `\n[${message.date?.toLocaleString('en-US', message_date_format)}] ${message.is_outbound ? 'Journal:' : 'Human: '} ${message.content}` }).join('')

  init_prompt = `${init_prompt}\n${user!.bio}\n###\n${previous_messages_string}\n[${new Date(message.date).toLocaleString('en-US', message_date_format)}] Human: ${message.content}\n[${new Date().toLocaleString('en-US', message_date_format)}] Journal:`
  let openAIResponse = await openai.createCompletion({
    model: 'text-davinci-003', temperature: temp, presence_penalty: pres, frequency_penalty: freq, max_tokens: 256,
    prompt: init_prompt
  })
  if (!openAIResponse.data.choices[0].text) { error_alert('OpenAI Response was empty'); return }
  console.log(`${log_time(message.response_time)} - prompt + openAIResponse.data.choices[0].text`)
  console.log(init_prompt + openAIResponse.data.choices[0].text)
  send_message({ ...default_response, content: openAIResponse.data.choices[0].text, response_time: message.response_time })
} */

/* else if (category == Type.model) {
  let openAIResponse = await openai.createCompletion({
    model: 'text-davinci-003', temperature: 0.3, presence_penalty: 2.0, frequency_penalty: 2.0,
    prompt: `The user wants to modify their model and the weights of that model. The two possible models are "chat" and "text". The weights are "temperature", "frequency", and "presence". Adjust the values accordingly. Keep the order exactly the same.
    Current: 
    model: ${user.model}
    temperature: ${user.temp}
    frequency: ${user.freq}
    presence: ${user.pres}
    Message: ${message.content}\n
    Updated:`
  })
  let response = openAIResponse.data.choices[0].text!.split('\n')
  let response_values = response.map((line: string) => { return line.split(':') })
  if (!response_values) { return }
  let user_update = prisma.user.update({ where: { number: message.number! }, data: { model: response_values[0], temp: response_values[1], freq: response_values[2], pres: response_values[3] } })
} */

// ========================================================================================
// =======================================CHAT=============================================
// ========================================================================================

// ! adjust model
/* async function model_adjust(message: Message, user: User) {
  if (user?.model != null) model = user.model
  if (user?.temp != null) temp = user.temp.toNumber()
  if (user?.pres != null) pres = user.pres.toNumber()
  if (user?.freq != null) freq = user.freq.toNumber()
} */

/*  // ADJUST WEIGHTS
 else if (message.content.startsWith('w:') && admins.includes(user)) {
  let values = message.content.split('w:')[1], weights = values.split(',').map(str => Number(str))
  if (values == 'reset') temp = null, pres = null, freq = null
  else temp = weights[0], pres = weights[1], freq = weights[2]

  await sendblue.sendMessage({ content: `weights updated from (temp,pres,freq) = (${user.temp},${user.pres},${user.freq}) to (${temp},${pres},${freq})`, number: message.number, status_callback: sendblue_callback }) // don't log the message
  await prisma.user.update({ where: { number: message.number }, data: { temp, pres, freq } })
  return
} // ADJUST MODEL
else if (message.content.startsWith('m:') && admins.includes(user)) {
  let model = message.content.split('m:')[1]
  if (model == 'chat' || model == 'text' || model == 'rapid') {
    await prisma.user.update({ where: { number: message.number }, data: { model } })
    await sendblue.sendMessage({ content: `${model} activated\nweights (temp,pres,freq) = ${user.temp}, ${user.pres}, ${user.freq}\ndefault weights = ${temp}, ${pres}, ${freq}`, number: message.number, status_callback: sendblue_callback })
    return
  }
  await sendblue.sendMessage({ content: `think your formatting's wrong, try 'm:chat', 'm:text', 'm:rapid'`, number: message.number, status_callback: sendblue_callback })
  return
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


// ! TWILIO send_message
/* let response = await twilio.messages.create({
      body: message.content,
      mediaUrl: [message.media_url],
      messagingServiceSid: process.env.TWILIO_MESSAGING_SID,
      to: message.number,
      statusCallback: `${appURL}/twilio-status`,
    })
    // console.log(` ! Twilio full response: "${JSON.stringify(response.body)}"`)
    console.log(` ! Twilio response (${response.to}): ${response.status} ${response.body} (${message.media_url})`)
    return response */

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

// GPT Prisma query generation
/* async function test_openAI_query(message: string) {
  // https://platform.openai.com/playground/p/gs3gMaELFtvzh0Jdcg7fT2A5?model=text-davinci-003
  const extract_dates_prompt = `Extract the beginning and end times from the prompt below to help derive a search query. Do not modify the text, extract it as it is.
  Prompt: ${message}
  t0, t1: `

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
  }`

  try {
    const extract_dates = await openai.createCompletion({ model: 'text-davinci-003', prompt: extract_dates_prompt, max_tokens: 64, temperature: 0.3 })

    const query_text = await openai.createCompletion({
      model: 'code-davinci-002', prompt: query_prompt, max_tokens: 128,
      temperature: 0.5, frequency_penalty: 0, presence_penalty: 0,
      stop: ['//'],
    })
    const where: Object = JSON.parse(query_text.data.choices[0].text!)  //turn string into object to pass into Prisma query

    const query = await prisma.messages.findMany({ where: where, orderBy: { relevance: "desc", }, take: 10, })
  } catch (e) { error_alert(e) }
} */

// ========================================================================================
// ========================================OTHER+==========================================
// ========================================================================================

// ! QUOTE TXT TO ARRAY
/* const quotesText = fs.readFileSync('other/quotes.txt', 'utf8');
const quotesArray = quotesText.split('\n\n').map((quote) => quote.trim());
const quotesWrappedAndIndented = quotesArray.map((quote) => `\`${quote.replace(/\n\s+/g, '\n')}\``).join(', ');

console.log(quotesWrappedAndIndented); */
