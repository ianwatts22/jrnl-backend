require('dotenv').config()
import { messages, users, Prisma, PrismaClient } from '@prisma/client'
import { Client, ClientConfig } from 'pg'
import Sendblue from 'sendblue'
import axios from 'axios'
import express from 'express'
import morgan from 'morgan'
import bodyParser from 'body-parser'
import { Configuration, OpenAIApi, ChatCompletionRequestMessage } from "openai"
import cron from 'cron'
import os from 'os'

const app = express()
const sendblue = new Sendblue(process.env.SENDBLUE_API_KEY!, process.env.SENDBLUE_API_SECRET!)
const configuration = new Configuration({ organization: process.env.OPENAI_ORGANIZATION, apiKey: process.env.OPENAI_API_KEY, })
const openai = new OpenAIApi(configuration)

let hostname: string, link: string
if (os.hostname().split('.').pop() === 'local') {
  hostname = '127.0.0.1', link = process.env.NGROK!
} else { hostname = '0.0.0.0', link = 'https://jrnl.onrender.com' }
const PORT = Number(process.env.PORT)
app.listen(PORT, hostname, () => { console.log(`server at http://${hostname}:${PORT}/`) })
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(morgan('dev'))

// ========================================================================================
// ========================================DATABASE========================================
// ========================================================================================
// PostgreSQL db
let clientConfig: ClientConfig  // need to pass ssl: true for external access
process.env.PGHOST!.includes('render') ? clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT), ssl: true } : clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT) }
const client = new Client(clientConfig)
const prisma = new PrismaClient()
client.connect()

// update_prisma_db()
async function update_prisma_db() {
  
}

// * USER Profile 
interface User {
  number: string
  timezone: string    // EST, PST, MST, CT
  most_recent?: Date
  schedule?: string
  bio?: string
  // focus?: string, profile?: string, past?: string
}
async function log_user(user: User) {
  await prisma.users.create({ data: user })
  send_message({ content: `NEW USER`, number: admin_numbers.join() })
  users.push(user.number)
}

// * MESSAGES
interface Message {
  // Sendblue data
  content?: string
  media_url?: string
  is_outbound?: boolean
  date?: Date
  number?: string
  was_downgraded?: boolean
  send_style?: string
  group_id?: number
  // our data
  tokens?: number
  keywords?: string[]
  type?: string           // response, reach_out, profile_update, query
  relevance?: number
  reactions?: string[]
  content_letters?: string
}
async function log_message(message: Message) {
  if (message.content) message.content_letters = content_letters(message.content)
  await prisma.messages.create({ data: message })
}

const content_letters = (content: string) => content.slice(0, 30).replace(/[^a-z]/gi, "")

// ======================================================================================
// ========================================ROUTES========================================
// ======================================================================================

app.post('/signup-form', async (req: express.Request, res: express.Response) => {
  try {
    const t0 = Date.now()
    let fields = req.body.data.fields
    res.status(200).end()
    let user: User = { number: fields[0].value, timezone: fields[1].options.find((option: any) => option.id === fields[1].value).text }

    let existing_user = await get_user(user.number)
    if (!existing_user) {
      await send_message({ content: greeting_message.content, number: user.number, media_url: greeting_message.media_url, send_style: greeting_message.send_style })
      log_user(user)
    } else { return }
    console.log(`${Date.now() - t0}ms - /signup-form ${user.number}`)
  } catch (e) {
    res.status(500).end()
    error_alert(e)
  }
})

app.post('/message', (req: express.Request, res: express.Response) => {
  try {
    const t0 = Date.now()
    const message: Message = { content: req.body.content, media_url: req.body.media_url, number: req.body.number, was_downgraded: req.body.was_downgraded, is_outbound: false, date: req.body.date_sent, group_id: Number(req.body.group_id) }
    res.status(200).end()
    console.log(message.content)
    analyze_message(message)

    console.log(`${Date.now() - t0}ms - /message: (${message.number})`)
  } catch (e) {
    res.status(500).end()
    error_alert(e)
  }
})
app.post('/message-status', (req: express.Request, res: express.Response) => {
  try {
    const t0 = Date.now()
    const message_status = req.body
    res.status(200).end()
    console.log(`${Date.now() - t0}ms - /message-status`)
  } catch (e) {
    res.status(500).end()
    error_alert(e)
  }
})

// ======================================================================================
// ========================================TESTING=======================================
// ======================================================================================

// test()
async function test() {
  let message: Message = { content: `text: what's the share link` }
  const categories = ['discuss', 'update_profile', 'customer_support']
  let prompt: ChatCompletionRequestMessage[] = [
    { role: 'system', content: `You are part of an AI journaling chatbot. To determine which function to run next, categorize the users intent into one of the following: ${categories}.  Customer support is ONLY for people asking specifically about how the service works.` },
    { role: 'system', name: 'example_user', content: 'text: I need help planning my day' },
    { role: 'system', name: 'example_assistant', content: 'category: discuss' },
    { role: 'system', name: 'example_user', content: `text: what's my bio` },
    { role: 'system', name: 'example_assistant', content: 'category: update_profile' },
    { role: 'system', name: 'example_user', content: `text: change my hometown to Ann Arbor` },
    { role: 'system', name: 'example_assistant', content: 'category: update_profile' },
    { role: 'system', name: 'example_user', content: `text: how does this app work` },
    { role: 'system', name: 'example_assistant', content: 'category: customer_support' },
  ]
  // prompt = prompt.concat(previous_messages) // ? does this do more harm than good?
  prompt = prompt.concat([{ role: 'user', content: `text: ${message.content!}` }])
  console.log(prompt)

  const completion = await openai.createChatCompletion({ model: 'gpt-3.5-turbo', temperature: 0.1, messages: prompt, n: 4 })
  // console.log(JSON.stringify(completion))
  console.log(completion.data.choices[0])
  const choices = completion.data.choices.map((choice: any) => choice.message.content)
  console.log(choices)
  // return completion.data.choices[0].message!.content.split(':')[1].toLowerCase().replace(/\s/g, '')
}

// ======================================================================================
// ========================================FUNCTIONS=====================================
// ======================================================================================

const job = new cron.CronJob('55 */1 * * *', async () => {
  const t0 = new Date().getHours(), times = [9, 13, 17, 21], timezones = ['PST', 'MST', 'CST', 'EST']
  const users_with_timezone = await prisma.users.findMany({ where: { timezone: { not: null } } })
  users_with_timezone.forEach(user => {
    if (times.includes(t0 + timezones.indexOf(user.timezone!))) { format_text({ content: '', number: user.number }) }
  })
})
job.start()

let users: string[]
local_data()
async function local_data() {
  try { users = await prisma.users.findMany().then(users => users.map(user => user.number))
  } catch (e) { console.log(e) }
}

async function analyze_message(message: Message) {
  const t0 = Date.now()
  if (!message.content || !message.number) { return }
  await log_message(message)

  if (!users.includes(message.number)) {
    await send_message({ content: greeting_message.content, number: message.number, media_url: greeting_message.media_url, send_style: greeting_message.send_style })
    users.push(message.number!)
    return
  }
  const reactions = ['Liked', 'Disliked', 'Emphasized', 'Laughed at', 'Loved']
  if (reactions.some(reaction => message.content!.startsWith(reaction))) {
    const reaction = message.content.split('“', 2)[0].slice(0, -1)
    console.log(reaction)
    let reacted_to = message.content.split('“', 2)[1].slice(0, -3)
    console.log(reacted_to)
    console.log(content_letters(reacted_to))
    const reacted_message = await prisma.messages.findFirst({ where: { number: message.number, content_letters: { startsWith: content_letters(reacted_to) } } })
    console.log(reacted_message)
    if (reacted_message) {
      let new_reactions: string[] = reacted_message.reactions
      console.log('1 ', new_reactions)
      new_reactions.push(reaction)
      console.log('2 ', new_reactions)
      await prisma.messages.update({ where: { id: reacted_message.id }, data: { reactions: new_reactions } })
      console.log(`(${message.number}) reacted to ${reacted_to}\nnew reactions: ${new_reactions}`)
    }
    return
  }

  if (message.content.includes('admin message\n###') && admin_numbers.includes(message.number!)) {
    send_message({ content: message.content.split('###').pop(), number: message.number })
    return
  }

  const categories = ['discuss', 'update_profile', 'customer_support']
  const categorize = async () => {
    try {
      const previous_messages = await get_previous_messages(message, 6)

      // old jawn, still working
      const category_response = await openai.createCompletion({
        model: 'text-davinci-003', temperature: 0.3,
        prompt: `You are part of an AI journaling chatbot. To determine which function to run next, categorize the users intent into one of the following: ${categories}.  Customer support is ONLY for people asking specifically about how the service works. Examples:\nText: I need help planning my day\nCategory: discuss\nText: what's my bio\nCategory: update_profile\nText: change my hometown to Ann Arbor\nCategory: update_profile\nText: how does this app work\nCategory: customer_support\nSome of your previous conversation is included below for context###${previous_messages}###\nText: ${message.content}\nCategory:`
      })
      return category_response.data.choices[0].text!.toLowerCase().replace(/\s/g, '')

      // ! new jawn, not working
      /* let prompt: ChatCompletionRequestMessage[] = [
        { role: 'system', content: `You are part of an AI journaling chatbot. To determine which function to run next, categorize the users intent into one of the following: ${categories}.  Customer support is ONLY for people asking specifically about how the service works.` },
        { role: 'system', name: 'example_user', content: 'text: I need help planning my day' },
        { role: 'system', name: 'example_assistant', content: 'category: discuss' },
        { role: 'system', name: 'example_user', content: `text: what's my bio` },
        { role: 'system', name: 'example_assistant', content: 'category: update_profile' },
        { role: 'system', name: 'example_user', content: `text: change my hometown to Ann Arbor` },
        { role: 'system', name: 'example_assistant', content: 'category: update_profile' },
        { role: 'system', name: 'example_user', content: `text: how does this app work` },
        { role: 'system', name: 'example_assistant', content: 'category: customer_support' },
      ]
      // prompt = prompt.concat(previous_messages) // ? does this do more harm than good?
      prompt = prompt.concat([{ role: 'user', content: `text: ${message.content!}` }])
      console.log(prompt)
      const completion = await openai.createChatCompletion({ model: 'gpt-3.5-turbo', temperature: 0.1, messages: prompt, n: 4 })
      return completion.data.choices[0].message!.content.split(':')[1].toLowerCase().replace(/\s/g, '') */
    } catch (e) { await send_message({ content: `sorry bugged out, try again`, number: message.number }); return }
  }

  const category = await categorize()
  console.log(`category: ${category}`)
  if (!category || !categories.includes(category!)) {
    error_alert(` ! miscategorization (${message.number}): '${message.content}'\ncategory: ${category}`)
    await send_message({ content: `sorry bugged out, try again`, number: message.number })
    return
  }

  if (category.includes('discuss')) {
    format_text(message)

  } else if (category.includes('update_profile')) {
    const user = await get_user(message.number!)
    let openAIResponse = await openai.createCompletion({
      model: 'text-davinci-003', max_tokens: 512, temperature: 0.3, presence_penalty: 2.0, frequency_penalty: 2.0,
      prompt: `Below is a message from the user along with their bio. We believe they want to view their existing bio or update it. First determine their intent (view or update), then return either their existing or updated bio. If their bio is blank, put "empty". Previous messages are included which may help. Condense the information, remove extraneous words. Replace many words with few. Group relevant information. Separate disparate information with new lines. Format the bio like the following example, extracting the key words from the message.\n###\nExample bio:\n- from Los Angeles\n- studied mechanical engineering\n- polymath\n###\nRespond in the following format: <view or update>:<bio>\nBio:\n${user ? user.bio : ''}\nMessage: ${message.content}\nResponse:`
    })

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

    const response = openAIResponse.data.choices[0].text!.split(':')
    console.log(response)
    await send_message({ content: `${response[0].toLowerCase().replace(/\s/g, '') == 'view' ? 'your bio:' : 'updated bio:'}\n${response[1]}`, number: message.number })
    await prisma.users.update({ where: { number: message.number! }, data: { bio: response[1] } })

  } else if (category.includes('customer_support')) {
    let openAIResponse = await openai.createCompletion({
      model: 'text-davinci-003', max_tokens: 256, temperature: 0.9, presence_penalty: 1.0, frequency_penalty: 1.0,
      prompt: `You are customer support for a conversational AI text-message journaling service called 'jrnl'. Since it's texts, keep responses brief and casual. Answer questions specifically, without extraneious information. Speak in few words, casually. The following is a description of the product/service\n- jrnl is meant to make journaling easier than ever, lowering the barriers by making it casual and conversational\n- you can add information to your bio to provide the bot with a better understanding of you\n- signup link: https://tally.so/r/w4Q7kX\nConversation:\n###\n
      Text: ${message.content}\nResponse:`
    })
    await send_message({ content: openAIResponse.data.choices[0].text, number: message.number! })
  }
  console.log(`${Date.now() - t0}ms - analyze_message`)
}

async function format_text(message: Message) {
  let init_prompt = `CONTEXT (DO NOT MENTION)\ntoday: ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
You are a chatbot used to ask questions about someone's life. You are to act as a way for the user to easily journal their life, helping them record their emotions and day-to-day life. You are kind, empathetic, and supportive, but are willing to ask hard questions and hold people accountable. Reflect who they are, acting as a mirror for people to better see and understand themselves. You speak in few words, with wit and humor.

LIMITATIONS
You have no internet access, and may get specific facts wrong. 

GUIDELINES
Be inquisitive about a person's day, their activities, how they feel emotionally.
Ask people to expand on things if they are not clear.
Be curious about things they say.
Ask them to be specific.
Speak casually (contractions, slang, emojis ok).
Speak in few workds, consolidate sentences.
Avoid repeating information.
Be reassuring when replying to negative comments.
Do not provide or mention links to the internet.

A bio of the user is provided below for you to better understand who they are and empathize with them.`

  const reacted_messages = await prisma.messages.findMany({
    where: { number: message.number, reactions: { hasSome: ["Loved", "Emphasized"] } },
    orderBy: { date: "desc" }, take: 10
  })
  const reacted_preceding_messages = await Promise.all(reacted_messages.map(async (message: messages) => {
    try {
      return await prisma.messages.findFirstOrThrow({ where: { number: message.number, id: message.id - 1 } })
    } catch (e) { return message }
  }))
  let reacted_messages_array = reacted_preceding_messages.flatMap((value, index) => [value, reacted_messages[index]])

  const reacted_messages_examples: ChatCompletionRequestMessage[] = reacted_messages_array.map((message: messages) => {
    return {
      role: 'system', name: message.is_outbound ? 'example_assistant' : 'example_user',
      content: `[${message.date!.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "numeric", hour12: true, })}] ${message.content}`
    }
  })

  const user = await get_user(message.number!)

  let previous_messages = await get_previous_messages(message, 20)
  let prompt: ChatCompletionRequestMessage[] = [{ role: 'system', content: init_prompt }]
  prompt = prompt.concat(reacted_messages_examples)  // add reacted messages as examples
  prompt = prompt.concat(previous_messages)
  prompt = prompt.concat([{ role: 'user', content: message.content! }])
  console.log(prompt)

  const completion = await openai.createChatCompletion({
    model: 'gpt-3.5-turbo', temperature: 0.7, presence_penalty: 0.0, frequency_penalty: 1.0, max_tokens: 2048, messages: prompt,
  })
  let completion_string = completion.data.choices[0].message!.content
  if (completion_string.includes('M]')) { completion_string = completion_string.split('M] ')[1] }

  await send_message({ content: completion_string, number: message.number, tokens: message.tokens })
}

async function get_previous_messages(message: Message, amount: number = 14) {
  // TODO not ideal cuz parses EVERY message from that number lol
  const resetMessage = await prisma.messages.findFirst({ where: { number: message.number, content: 'reset' }, orderBy: { id: 'desc' } })
  let resetMessageLoc
  resetMessage === null ? resetMessageLoc = 0 : resetMessageLoc = resetMessage.id
  let previous_messages = await prisma.messages.findMany({ where: { number: message.number, id: { gt: resetMessageLoc } }, orderBy: { id: 'desc' }, take: amount })

  previous_messages = previous_messages.reverse()
  const previous_messages_array: ChatCompletionRequestMessage[] = previous_messages.map((message: messages) => {
    return {
      role: message.is_outbound ? "assistant" : "user",
      content: `[${message.date!.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "numeric", hour12: true, })}] ${message.content}`
    }
  })

  return previous_messages_array
}

// ======================================================================================
// ========================================BASICS=======================================
// ======================================================================================

const send_style_options = ["celebration", "shooting_star", "fireworks", "lasers", "love", "confetti", "balloons", "spotlight", "echo", "invisible", "gentle", "loud", "slam"]
const signup_link = 'https://tally.so/r/w4Q7kX', admin_numbers = ['+13104974985', '+12015190240']

async function send_message(message: Message) {
  try {
    const t0 = Date.now()
    message.date = new Date(), message.is_outbound = true
    await sendblue.sendMessage({ content: message.content, number: message.number!, send_style: message.send_style, media_url: message.media_url, status_callback: `${link}/message-status` })
    log_message(message)
    console.log(`${Date.now() - t0}ms - send_message`)
  } catch (e) { error_alert(e) }
}
async function get_user(number: string) {
  try { return await prisma.users.findFirst({ where: { number: number } }) }
  catch (e) { error_alert(e) }
}

// ====================================ADMIN STUFF==================================

async function error_alert(error: any) {
  // await send_message({ content: `ERROR: ${error}`, number: admin_numbers.toString() })
  console.error(`ERROR: ${error}`)
}

const greeting_message: Message = { content: `Hi I'm jrnl, your conversational AI journal. We're trying to  Reply to my questions or text me when you want. I messsage every 3 hours throughout the day, Feel free to react to messages to better train me. Everything operates on natural language, so no need to learn any fancy commands. Your 'bio' provides me insight, helping me help you. Ask to view it or change it anytime. Remember, no special commands just speak as you would Add the contact card and pin me in your messages for quick access.`, media_url: `https://ianwatts22.github.io/jrnl/assets/jrnl.vcf`, send_style: 'laser' }