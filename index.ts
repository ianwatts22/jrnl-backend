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
import * as chrono from 'chrono-node'
import { PineconeClient } from "@pinecone-database/pinecone";



const app = express()
const sendblue = new Sendblue(process.env.SENDBLUE_API_KEY!, process.env.SENDBLUE_API_SECRET!)
const sendblue_test = new Sendblue(process.env.SENDBLUE_TEST_API_KEY!, process.env.SENDBLUE_TEST_API_SECRET!)

const pinecone = new PineconeClient();
// ! initially had a top-level await but it was causing issues w/ TS, should figure out top-level await
pinecone.init({ environment: "YOUR_ENVIRONMENT", apiKey: process.env.PINECONE_API_KEY! })

// OpenAI config
const configuration = new Configuration({ organization: process.env.OPENAI_ORGANIZATION, apiKey: process.env.OPENAI_API_KEY, })
const openai = new OpenAIApi(configuration)

// START Connects system to internet DON'T TOUCH
let hostname: string
os.hostname().split('.').pop() === 'local' ? hostname = '127.0.0.1' : hostname = '0.0.0.0'
const PORT = Number(process.env.PORT)
app.listen(PORT, hostname, () => { console.log(`server at     http://${hostname}:${PORT}/`) })

// middleware & static files, comes with express
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))
app.use(bodyParser.json())
app.use(morgan('dev'))
// End Connects system to internet DON'T TOUCH

// ========================================================================================
// ========================================DATABASE========================================
// ========================================================================================
// PostgreSQL db
let clientConfig: ClientConfig  // need to pass ssl: true for external access
process.env.PGHOST!.includes('render') ? clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT), ssl: true } : clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT) }
const client = new Client(clientConfig);
const prisma = new PrismaClient()
client.connect();

// * USER Profile 
interface User {
  number: string
  name?: string
  email?: string
  timezone: string
  most_recent?: Date
}
async function log_user(user: User) { await prisma.users.create({ data: user }) }

// * MESSAGES
interface Message {
  content?: string
  media_url?: string
  is_outbound?: boolean
  date?: Date
  number?: string
  was_downgraded?: boolean
  tokens?: number
  send_style?: string
  keywords?: string[]
  type?: string    // response, reach-out, query
  group_id?: string
  relevance?: number
}

async function log_message(message: Message) {
  const t0 = Date.now()
  // TODO: replace with tokenizer? (find in Readme)
  if (message.tokens && message.content) { message.tokens = Math.round(message.content.split(' ').length * 4 / 3) }


  // await prisma.messages.create({ data: message }) // ! wtf is wrong here?
  console.log(`${Date.now() - t0}ms - log_message`)
}

// ======================================================================================
// ========================================ROUTES========================================
// ======================================================================================

app.post('/signup-form', async (req: express.Request, res: express.Response) => {
  try {
    const t0 = Date.now()
    console.log(JSON.stringify(req.body))

    let fields = req.body.data.fields
    res.status(200).end()
    let user: User = { name: fields[0].value, number: fields[1].value, timezone: fields[2].value.options.find((option: any) => option.id === fields[2].value).text }  // Tally webhooks data formatting is a nightmare

    let existing_user = await get_user(user.number)
    if (!existing_user) {
      send_message({ content: `Welcome to jrnl, your conversational journal buddy. Consistent journaling is hard, so we're lowering the barrier. Text us when you want,  Add the contact card and pin me for max utility.`, media_url: `https://ianwatts.site/assets/Robome.vcf`, number: user.number })
    }
    log_user(user)

    send_message({ content: `NEW USER: ${user.name} ${user.number}`, number: admin_numbers.join() })
    const t1 = Date.now()
    console.log(`${t1 - t0}ms - /signup-form: ${user.name} ${user.number}`)
  } catch (e) {
    error_alert(e)
    res.status(500).end()
  }
})

app.post('/message', (req: express.Request, res: express.Response) => {
  try {
    const t0 = Date.now()
    const message: Message = { content: req.body.content, media_url: req.body.media_url, number: req.body.number, was_downgraded: req.body.was_downgraded, is_outbound: false, date: req.body.date_sent, group_id: req.body.group_id }
    res.status(200).end()

    analyze_message(message, req.body.accountEmail)

    const t1 = Date.now()
    console.log(`${t1 - t0}ms - /message: (${message.number}${message.content}`)
  } catch (e) {
    console.log(e)
    send_message({ content: `ERROR: ${e} ${req.body.error_message}`, number: admin_numbers.toString() })
    res.status(500).end()
  }
})

// ======================================================================================
// ========================================TESTING=======================================
// ======================================================================================

// CRON
// RUNS EVERY 5 MINUTES
const job = new cron.CronJob('0 */1 * * *', async () => {
  console.log('CRON:')
})
job.start()

async function test() {
  const response = await openai.createEmbedding({
    model: "text-embedding-ada-002",
    input: "The food was delicious and the waiter...",
  });
}

test_chrono()
async function test_chrono() {
  const parsed_date = chrono.parseDate('july')
  console.log(parsed_date)
}

async function test_openAI_query(message: string) {
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
  }
  
  // Date: 2/23/23
  // Prompt: how many times did I mention Jeff in the January
  
  const query = prisma.messages.findMany({
    where: where,
  })
  const where = `

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
}

// ======================================================================================
// ========================================FUNCTIONS========================================
// ======================================================================================

async function send_message(message: Message, test?: boolean) {
  message.date = new Date()
  message.is_outbound = true
  let response
  // if (message.group_id)
  if (test) {
    response = await sendblue_test.sendMessage({ content: message.content, number: message.number!, send_style: message.send_style, media_url: message.media_url })
  } else {
    response = await sendblue.sendMessage({ content: message.content, number: message.number!, send_style: message.send_style, media_url: message.media_url }) // TODO add status_callback
  }
  log_message(message)
  console.log(``)
}

// ==========================ANALYZE MESSAGE=========================

async function analyze_message(message: Message, accountEmail?: string) {
  if (!message.content || !message.number) { return }
  await log_message(message)
  let test = false
  if (accountEmail == 'alecwatts1@gmail.com') { test = true }

  const content_lc = message.content.toLowerCase()

  // feedback, help (FAQ->directions->support), image, logging, 

  if (content_lc.includes('admin message\n###') && admin_numbers.includes(message.number!)) {
    send_message({ content: message.content.split('###').pop(), number: message.number }, test)
  } else {
    format_text(message, test)
  }
}

async function get_context(message: Message) {

  // const last10Messages = await prisma.messages.findMany({
  //   where: {
  //     number: message.number,
  //     // message_type: { not: { is: "query" } }  // TODO is this right lol
  //   },
  //   orderBy: { id: 'desc' }, take: 10
  // })

  // const dateFormat = { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true }
  // const last10MessagesString = last10Messages.map((message: messages) => {
  //   message.is_outbound ? `\n[${message.date!.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true })}] Journal: ${message.content}` : `\n[${message.date!.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true })}]Human: ${message.content}`
  // }).reverse().join('')

  // console.log(last10MessagesString)
  // return last10MessagesString

  return 'need to fix last10Messages'
}

const get_user = async (number: string) => await prisma.users.findFirst({ where: { number: number }, })

async function format_text(message: Message, test?: boolean) {
  let init_prompt = `CONTEXT (DO NOT MENTION)\ntoday: ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}You are a chatbot used for conversational journaling. You act as a digital mirror of the journaler, helping them explore their emotions and ideas out of their head and into the real world. You are kind, empathetic, and supportive, but are not a pushover and are willing to ask hard questions.
LIMITATIONS:
You have no internet access, and may get specific facts wrong
GUIDELINES:
Ask people to expand on things if
No obvious, general information. Be specific.
Speak casually (contractions, slang, emojis ok).
Avoid repeating information.
Do not provide or mention links to the internet.`

  let context = await get_context(message)
  let prompt = `${init_prompt} ${context} \nJournal:`

  console.log(prompt)
  respond_text(message, prompt, test)
}

// ==========================================

async function respond_text(message: Message, prompt: string, test?: boolean) {
  try {
    const t0 = Date.now()

    let openAIResponse = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: prompt,
      max_tokens: 400,
      temperature: 0.9,
      presence_penalty: 1.0,    // between -2 to 2
      frequency_penalty: 1.0,   // between -2 to 2
      // suffix: '', https://beta.openai.com/docs/api-reference/completions/create#completions/create-suffix
      // user: '', https://beta.openai.com/docs/api-reference/completions/create#completions/create-user
    });
    if (!openAIResponse.data.usage) { return }
    // let prompt_tokens = openAIResponse.data.usage.prompt_tokens
    // let completion_tokens = openAIResponse.data.usage.completion_tokens
    message.tokens = openAIResponse.data.usage.total_tokens

    await send_message({ content: openAIResponse.data.choices[0].text, number: message.number, tokens: message.tokens }, test)

    const t1 = Date.now()
    console.log(`${t1 - t0}ms - respond_text`)
  } catch (err) { console.log(` ! respond_text error: ${err}`) }
}

let send_style_options = new Set(["celebration", "shooting_star", "fireworks", "lasers", "love", "confetti", "balloons", "spotlight", "echo", "invisible", "gentle", "loud", "slam"])
const signup_link = 'https://tally.so/r/w4Q7kX'
const subscribe_link = 'https://ianwatts.site/robome.html'    //SUBCRIPTION PAYMENT
const subscription_link = 'https://billing.stripe.com/p/login/9AQ14y0S910meZO6oo'
const admin_numbers = ['+13104974985', '+12015190240']    // Watts, Pulice

// ====================================ADMIN STUFF==================================

async function error_alert(error: any) {
  await send_message({ content: `ERROR: ${error}`, number: admin_numbers.toString() })
  console.error(`ERROR: ${error}`)
}

// let numberOfMessagesFromUsers = prisma.messages.count({
//   where: { number: { notIn: admin_numbers }, is_outbound: false }
// }).then((count) => { console.log(`messages received: ${count}`) })

// let numberOfUsers = prisma.users.count({
//   where: { number: { notIn: admin_numbers }, }
// }).then((count) => { console.log(`total users: ${count}`) })

// ! made by copilot really did all this on it's own lol
/* let numberOfUsersActive = prisma.users.count({
  where: {
    number: {
      notIn: admin_numbers
    },
    last_message: {
      gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)
    }
  }
}).then((count) => { console.log(`active users: ${count}`) }) */

// console.log(`Number of messages from users: ${numberOfMessagesFromUsers}`)