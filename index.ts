require('dotenv').config()
import { messages, users, Prisma, PrismaClient } from '@prisma/client'
import { Client, ClientConfig } from 'pg'
import Sendblue from 'sendblue'
import axios from 'axios'
import express from 'express'
import morgan from 'morgan'
import bodyParser from 'body-parser'
import { Configuration, OpenAIApi } from "openai"
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

// * USER Profile 
interface User {
  number: string
  name: string
  email?: string
  timezone: string    // EST, PST, MST, CT
  most_recent?: Date
  schedule?: string
  bio?: string
  // focus?: string
  // profile?: string
  // past?: string
}
async function log_user(user: User) {
  await prisma.users.create({ data: user })
  send_message({ content: `NEW USER: ${user.name} ${user.number}`, number: admin_numbers.join() })
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
}
async function log_message(message: Message) { await prisma.messages.create({ data: message }) }

// ======================================================================================
// ========================================ROUTES========================================
// ======================================================================================

app.post('/signup-form', async (req: express.Request, res: express.Response) => {
  try {
    const t0 = Date.now()
    let fields = req.body.data.fields
    res.status(200).end()
    let user: User = { name: fields[0].value, number: fields[1].value, timezone: fields[2].value.options.find((option: any) => option.id === fields[2].value).text }

    let existing_user = await get_user(user.number)
    if (!existing_user) {
      send_message({ content: `Hi I'm jrnl, your conversational AI journal. We're trying to  Reply to my questions or text me when you want. I messsage every 3 hours throughout the day, Feel free to react to messages to better train me. Everything operates on natural language, so no need to learn any fancy commands. Your 'bio' provides me insight, helping me help you. Ask to view it or change it anytime. Remember, no special commands just speak as you would Add the contact card and pin me in your messages for quick access.`, media_url: `https://ianwatts22.github.io/jrnl/assets/jrnl.vcf`, number: user.number, send_style: 'laser' })
    }
    log_user(user)

    console.log(`${Date.now() - t0}ms - /signup-form: ${user.name} ${user.number}`)
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

    analyze_message(message, req.body.accountEmail)

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

}

// ======================================================================================
// ========================================FUNCTIONS=====================================
// ======================================================================================

const job = new cron.CronJob('55 */1 * * *', async () => {
  const t0 = new Date().getHours(), times = [9, 12, 3, 6, 9], timezones = ['PST', 'MST', 'CST', 'EST']
  const users_with_timezone = await prisma.users.findMany({ where: { timezone: { not: null } } })
  users_with_timezone.forEach(user => {
    if (times.includes(t0 + timezones.indexOf(user.timezone!))) {
      format_text({ content: '', number: user.number})
    }
  })
})
job.start()

async function analyze_message(message: Message, accountEmail?: string) {
  const t0 = Date.now()
  if (!message.content || !message.number) { return }
  await log_message(message)

  const content_lc = message.content.toLowerCase()
  const reactions = ['liked', 'disliked', 'emphasized', 'laughed at', 'loved']
  if (reactions.some(reaction => content_lc.startsWith(reaction))) { return }

  if (content_lc.includes('admin message\n###') && admin_numbers.includes(message.number!)) {
    send_message({ content: message.content.split('###').pop(), number: message.number })
    return
  }

  let previous_messages = await get_previous_messages(message, 6)
  const categories = ['discuss', 'update_profile', 'customer_support']
  const categorize = async () => {
    try {
      const category_response = await openai.createCompletion({
        model: 'text-davinci-003', temperature: 0.3,
        prompt: `You are part of an AI journaling chatbot. To determine which function to run next, categorize the users intent into one of the following: ${categories}.  Customer support is ONLY for people asking specifically about how the service works. Examples:\nText: I need help planning my day\nCategory: discuss\nText: what's my bio\nCategory: update_profile\nText: change my hometown to Ann Arbor\nCategory: update_profile\nText: how does this app work\nCategory: customer_support\nSome of your previous conversation is included below for context###${previous_messages}###\nText: ${message.content}\nCategory:`
      })
      return category_response.data.choices[0].text?.toLowerCase().replace(/\s/g, '')
    } catch (e) { return null }
  }

  const category = await categorize()
  console.log(`category_lc: ${category}`)
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
      model: 'text-davinci-003', max_tokens: 512, temperature: 0.3, presence_penalty: 2.0, frequency_penalty: 2.0,  // presence and frequency maxed
      prompt: `Below is a message from the user along with their bio. We believe they to view their existing bio or update it. First determine their intent (view or update), then return either their existing or updated bio. If their bio is blank, put "empty". Previous messages are included which may help. Condense the information, remove extraneous words. Replace many words with few. Group relevant information. Separate disparate information with new lines. Format the bio like the following example, extracting the key words from the message.\n###\nExample bio:\n- from Los Angeles\n- studied mechanical engineering\n- polymath\n###\nRespond in the following format: <view or update>:<bio>\nBio:\n${user ? user.bio : ''}\nMessage: ${message.content}\nResponse:`
    })
    const response = openAIResponse.data.choices[0].text!.split(':')
    console.log(response)
    await send_message({ content: `${response[0].toLowerCase().replace(/\s/g,'') == 'view' ? 'your bio:' : 'updated bio:'}\n${response[1]}`, number: message.number })
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
You are a chatbot used to ask questions about someones life. You are to act as a way for the user to easily journal their life, helping them record their emotions and day to day life. You are kind, empathetic, and supportive, but are willing to ask hard questions and hold people accountable. Try to reflect who they are, acting as a mirror for people to better see and understand themselves.

LIMITATIONS:
You have no internet access, and may get specific facts wrong. 

GUIDELINES: 
Be inquisitive about a person's day, their activities, how they feel emotionally.
Ask people to expand on things if they are not clear.
Be curious about things they say.
Ask them to be specific.
Speak casually (contractions, slang, emojis ok).
Be friendly.
Avoid repeating information.
Be reassuring when replying to negative comments.
Do not provide or mention links to the internet.

A bio of the user is provided below for you to better understand who they are and empathize with them.`

  const user = await get_user(message.number!)

  let previous_messages = await get_previous_messages(message)

  let prompt = `${init_prompt}\n${user!.bio}\n###\n${previous_messages}\n[${new Date().toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true })}] Journal:`

  console.log(prompt)
  respond_text(message, prompt)
}

async function get_previous_messages(message: Message, amount: number = 20) {
  // TODO: not ideal cuz parses EVERY message from that number lol
  const resetMessage = await prisma.messages.findFirst({ where: { number: message.number, content: 'r' }, orderBy: { id: 'desc' } })
  let resetMessageLoc
  resetMessage === null ? resetMessageLoc = 0 : resetMessageLoc = resetMessage.id
  const previous_messages = await prisma.messages.findMany({ where: { number: message.number, id: { gt: resetMessageLoc } }, orderBy: { id: 'desc' }, take: amount })

  const previous_messages_string = previous_messages.map((message: messages) => { return `\n[${message.date ? message.date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true }) : null}] ${message.is_outbound ? 'Journal:' : 'Human: '} ${message.content}` }).reverse().join('')
  return previous_messages_string
}

async function respond_text(message: Message, prompt: string) {
  try {
    const t0 = Date.now()

    let openAIResponse = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: prompt, max_tokens: 512, temperature: 0.9, presence_penalty: 1.0, frequency_penalty: 1.0,
    })

    await send_message({ content: openAIResponse.data.choices[0].text, number: message.number, tokens: message.tokens })
    console.log(`${Date.now() - t0}ms - respond_text`)
  } catch (err) { console.log(` ! respond_text error: ${err}`) }
}

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