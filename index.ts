require('dotenv').config()
import { Prisma, PrismaClient } from '@prisma/client'
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
const sendblue_test = new Sendblue(process.env.SENDBLUE_TEST_API_KEY!, process.env.SENDBLUE_TEST_API_SECRET!)

//domain for signup --> UPDATE 
const signup_link = 'https://tally.so/r/nWJNXQ'

//SUBCRIPTION PAYMENT 
/*const subscribe_link = 'https://ianwatts.site/robome.html'
const subscription_link = 'https://billing.stripe.com/p/login/9AQ14y0S910meZO6oo'
const admin_numbers = ['+13104974985', '+13109221006']    // Ian, Alec
*/

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
// ========================================DATABASE========================================
// PostgreSQL db
let clientConfig: ClientConfig  // need to pass ssl: true for external access
if (process.env.PGHOST!.includes('render')) {
  clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT), ssl: true }
} else {
  clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT) }
}
const client = new Client(clientConfig);
const prisma = new PrismaClient()
client.connect();

// * USER Profile 
// TO UPDATE 
interface User {
  number: string
  name?: string
  gender?: string
  birthdate?: Date
  location?: string
  bio?: string
  subscription?: string
  // email?: string
}

//CREATE USER PROFILE 
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
  message_type?: string
  group_id?: string
}
async function log_message(message: Message) {
  // TODO: replace with tokenizer? (find in Readme)
  if (message.tokens && message.content) { message.tokens = Math.round(message.content.split(' ').length * 4 / 3) }

  await prisma.messages.create({ data: message });
}

// ======================================================================================
// ========================================TESTING=======================================
// ======================================================================================

// CRON
// RUNS EVERY 5 MINUTES
const job = new cron.CronJob('*/5 * * * *', async () => {
  console.log('Current time:')
})
job.start()

// ======================================================================================
// ========================================ROUTES========================================
// ======================================================================================

app.post('/webhook-tally', async (req: express.Request, res: express.Response) => {
  try {
    let fields = req.body.data.fields
    res.status(200).end()
    let user: User = { number: fields[0].value, name: fields[1].value, gender: fields[2].value, birthdate: new Date(fields[8].value), location: fields[9].value }  // Tally webhooks data formatting is a nightmare

    let existingUser = await prisma.users.findFirst({ where: { number: user.number } })
    if (!existingUser) {
      send_message({ content: `Add the contact card and pin me for max utility.`, media_url: `https://ianwatts.site/assets/Robome.vcf`, number: user.number })
      setTimeout(() => { send_message({ content: help_message, number: user.number }) }, 5000)
    }
    log_user(user)

    send_message({ content: `NEW USER: ${user.name} ${user.number}`, number: admin_numbers.join() })
    console.log('form received ' + user.number)
  } catch (e) {
    console.log(e)
    res.status(500).end()
  }
});

app.post('/message', (req: express.Request, res: express.Response) => {
  try {
    const t0 = Date.now()
    const message: Message = { content: req.body.content, media_url: req.body.media_url, number: req.body.number, was_downgraded: req.body.was_downgraded, is_outbound: false, date: req.body.date_sent, group_id: req.body.group_id }
    res.status(200).end()

    analyze_message(message, req.body.accountEmail)

    const t1 = Date.now()
    console.log(`${t1 - t0}ms - /message: ${message.content}`)
    console.log('message received ' + message.number + ': ' + message.content)
  } catch (e) {
    console.log(e)
    send_message({ content: `ERROR: ${e} ${req.body.error_message}`, number: admin_numbers.toString() })
    res.status(500).end()
  }
})

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

let help_message = ` - for a generative image, say "image of <description>" (ex. "image of ur mom")\n - text us personally 🙅🤖 at (310) 497-4985 (Ian) or (310) 922-1006 (Alec) to help out or get feedback (GIVE US ALL YOUR FEEDBACK)`

async function analyze_message(message: Message, accountEmail?: string) {
  if (!message.content || !message.number) { return }
  await log_message(message)
  let test = false
  if (accountEmail == 'alecwatts1@gmail.com') { test = true }

  const content_lc = message.content.toLowerCase()

  // feedback, help (FAQ->directions->support), image, logging, 

  if (content_lc.includes('admin message\n----') && admin_numbers.includes(message.number!)) {
    send_message({ content: message.content.split('----').pop(), number: message.number }, test)
  } else {
    format_text(message, test)
  }
}

async function get_context(message: Message) {

  const last10Messages = await prisma.messages.findMany({
    where: {
      number: message.number,
      // message_type: { not: { is: "query" } }  // TODO is this right lol
    },
    orderBy: { id: 'desc' },
    take: 10
  });

  const dateFormat = { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true }
  const last10MessagesString = last10Messages.map((message: messages) => {
    message.is_outbound ? `\n[${message.date!.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true })}] Journal: ${message.content}` : `\n[${message.date!.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true })}]Human: ${message.content}`
  }).reverse().join('')

  console.log(last10MessagesString)
  return last10MessagesString
}

const getUser = async (message: Message) => await prisma.users.findFirst({ where: { number: message.number }, })

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
  console.log(await time_since_message(message) + ' format_text')
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


// ====================================ADMIN STUFF==================================
// where number does not equal the numebrs in admin_numbers and outbound is true
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