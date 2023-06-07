require('dotenv').config()
import { Prisma, PrismaClient, Message, SendStyle, Reactions, Type, User, Model, Timezone, Words, WordsType } from '@prisma/client'
import { Client, ClientConfig } from 'pg'
import Sendblue from 'sendblue'
import express from 'express'
import morgan from 'morgan'
import bodyParser from 'body-parser'
import { Configuration, OpenAIApi, ChatCompletionRequestMessage } from 'openai'
import cron from 'cron'
import os from 'os'
import fs from 'fs'
import * as chrono from 'chrono-node'
import timezone from 'moment-timezone'
import { quotes, get_quote } from './other_data/quotes'
import { send } from 'process'
import { v2 as cloudinary } from 'cloudinary'

// const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN)

const app = express(), sendblue = new Sendblue(process.env.SENDBLUE_API_KEY!, process.env.SENDBLUE_API_SECRET!), configuration = new Configuration({ organization: process.env.OPENAI_ORGANIZATION, apiKey: process.env.OPENAI_API_KEY, })
const openai = new OpenAIApi(configuration)

let hostname = '0.0.0.0', link = 'https://jrnl.onrender.com', local = false; const PORT = Number(process.env.PORT)
if (os.hostname().split('.').pop() === 'local') hostname = '127.0.0.1', link = process.env.NGROK!, local = true
app.listen(PORT, hostname, () => { console.log(`server at http://${hostname}:${PORT}/`) })
app.use(express.static('public')); app.use(express.urlencoded({ extended: true }))
app.use(bodyParser.json()); app.use(morgan('dev')); app.use('/assets', express.static('assets'));

cloudinary.config({ cloud_name: 'dpxdjc7qy', api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET, secure: true })
// ========================================================================================
// ========================================DATABASE========================================
// ========================================================================================
let clientConfig: ClientConfig  // need to pass ssl: true for external access
process.env.PGHOST!.includes('render') ? clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT), ssl: true } : clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT) }
const client = new Client(clientConfig), prisma = new PrismaClient(); client.connect()

const default_message: Prisma.MessageCreateInput = {
  content: null, number: '', type: null, is_outbound: null, date: new Date(), was_downgraded: null, media_url: null, send_style: null, group_id: null,
  response_time: 0, content_letters: null, tokens: null,
  human: null, reactions: [], keywords: [], relevance: null, model: null, hour: null,
}

const default_user: User = {
  number: '', bio: '', timezone: Timezone.PST, principles: '',
  model: null, freq: null, pres: null, temp: null,
  directive: '', prompt: null
}
async function log_message(message: Prisma.MessageCreateInput) {
  if (message.content) message.content_letters = content_letters(message.content)
  await prisma.message.create({ data: message })
}

const content_letters = (content: string) => content.slice(0, 30).replace(/[^a-z]/gi, "")
let Watts: User | null, Pulice: User | null, admins: User[], admin_numbers: string[]
const signup_link = 'https://tally.so/r/w4Q7kX', contact_card = `${link}/assets/jrnl.vcf`

// ======================================================================================
// ========================================ROUTES========================================
// ======================================================================================

app.post('/signup-form', async (req: express.Request, res: express.Response) => {
  try {
    const t0 = Date.now()
    let fields = req.body.data.fields, user: User = { ...default_user, number: fields[0].value, timezone: fields[1].options.find((option: any) => option.id === fields[1].value).text }
    res.status(200).end()

    await prisma.user.upsert({ where: { number: user.number }, update: user, create: user })
    if (!users.includes(user)) {
      await send_message({ ...default_message, content: `welcome to jrnl, I’ll ask you to take a photo of what you’re doing at a random time during the day. snap a pic, write a caption on what you’re doing or how you’re feeling - it’s up to you. if you want to answer my follow up questions feel free to. you can message me at any other time as well!`, number: user.number, media_url: contact_card, send_style: SendStyle.lasers, response_time: t0 })
      await sendblue.sendGroupMessage({ content: `NEW USER`, numbers: admin_numbers })
      users.push(user)
    }

  } catch (e) { res.status(500).end(); error_alert(e) }
})

app.post('/message', (req: express.Request, res: express.Response) => {
  try {
    const message: Prisma.MessageCreateInput = { ...default_message, content: req.body.content, media_url: req.body.media_url, number: req.body.number, was_downgraded: req.body.was_downgraded, is_outbound: false, date: req.body.date_sent, group_id: Number(req.body.group_id), response_time: Number(new Date().valueOf()) }
    res.status(200).end()
    analyze_message(message)
    console.log(`(${message.number}): ${message.content} (${message.media_url})`)
  } catch (e) { res.status(500).end(); error_alert(e) }
})
app.post('/message-status', (req: express.Request, res: express.Response) => {
  try {
    const message_status = req.body; res.status(200).end()
  } catch (e) { res.status(500).end(); error_alert(e) }
})
const sendblue_callback = `${link}/message-status`

// ======================================================================================
// ======================================CRON, CACHE=====================================
// ======================================================================================

let users: User[]
local_data()
admin_numbers = ['+13104974985', '+12015190240']
async function local_data() {
  try {
    users = await prisma.user.findMany()
    Watts = await prisma.user.findUnique({ where: { number: '+13104974985' } }), Pulice = await prisma.user.findUnique({ where: { number: '+12015190240' } })
    if (Watts && Pulice) admins = [Watts, Pulice]
  } catch (e) { console.log(e) }
}

const timezones = Object.values(Timezone)
let current_hour: number
local ? current_hour = new Date().getHours() : current_hour = new Date().getHours() - 7 // time is GMT, our T0 is PST
const timezone_adjusted = new cron.CronJob('0 * * * *', async () => {
  users.forEach(async user => {
    // console.log(`CRON quote: ${user.number}, ${user.timezone}, ${timezones.indexOf(user.timezone)} ${[21].includes(current_hour + timezones.indexOf(user.timezone))}`)

    // if ([21].includes(current_hour + timezones.indexOf(user.timezone!))) await send_message({ ...default_message, content: get_quote(), number: user.number })
    // if ([8].includes(current_hour + timezones.indexOf(user.timezone!))) await send_message({ ...default_message, content: `What are three things you're grateful for?`, number: user.number })
    if ([mindfullness_time].includes(current_hour + timezones.indexOf(user.timezone!))) await send_message({ ...default_message, content: `mindfulness check. take a pic of what you're doing rn and write what you're thinking.`, number: user.number })
  })
  // console.log(`CRON current hour: ${current_hour}`)
  // await send_message({ ...default_message, content: `current hour: ${current_hour}`, number: '+13104974985' }, undefined, true)
})
timezone_adjusted.start()

const hourly = new cron.CronJob('0 * * * *', async () => {
  users.forEach(async user => {
    if (9 > (current_hour + timezones.indexOf(user.timezone!)) || 21 < (current_hour + timezones.indexOf(user.timezone!))) return
    
    const lastMessage = await prisma.message.findFirst({
      where: { number: user.number, date: { gte: new Date(Date.now() - 60*60*1000) } },
      orderBy: { date: 'desc' }
    })

    if (!lastMessage) await analyze_message({ ...default_message, content: `[no response. help the user take action.]`, number: user.number }, Type.follow_up)
  })
})
hourly.start()

let mindfullness_time = 11 + Math.floor(Math.random() * 9); // Generate random hour once per day
const reset_random_times = new cron.CronJob('0 0 * * *', () => {
  mindfullness_time = 11 + Math.floor(Math.random() * 9);
})
reset_random_times.start();

// QUESTIONS
interface Question { question: string, time: Date }
let admin_question: Question[] = [{ question: "what is something you’re afraid of doing, but believe you need to do? ", time: new Date('2023-03-22T02:00:00.000Z') }]
const admin_prompt = new cron.CronJob('0 * * * *', async () => {
  local ? current_hour = new Date().getHours() : current_hour = new Date().getHours() - 7 // time is GMT, our T0 is PST
  admin_question.forEach(async question => {
    if (question.time.toDateString() == new Date().toDateString() && question.time.getHours() == current_hour) {
      await send_message({ ...default_message, content: question.question, /* number: '+13104974985'  */ }, users)
    }
  })
})
admin_prompt.start()

/* const mindfullness_prompt = new cron.CronJob('0 * * * *', async () => {
  users.forEach(async (user: User) => {
    let current_hour = new Date().getHours()
    if (!local) current_hour > 7 ? current_hour = new Date().getHours() - 7 : current_hour = new Date().getHours() - 7 + 24
    // time is GMT, our T0 is PST
    if (mindfullness_time == current_hour - timezones.indexOf(user.timezone!)) {
      console.log(`mindfulness prompt: ${user.number}, ${user.timezone}, timezone index: ${timezones.indexOf(user.timezone)}, current hour: ${current_hour}`)
      await send_message({ ...default_message, content: `mindfulness check. take a pic of what you're doing rn and write what you're thinking.` }, users)
    }
  })
}) */


// every Sunday at 9pm local
const weekly_summary = new cron.CronJob('0 * * * 0', async () => {
  users.forEach(async (user: User) => {
    const last_week_messages = await prisma.message.findMany({ where: { number: user.number, date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), }, }, orderBy: { date: 'asc', } })
    if (last_week_messages.length < 5) send_message({ ...default_message, content: `Send more than 5 messages/week to get a weekly summary.`, number: user.number })
    if (21 == current_hour + timezones.indexOf(user.timezone!)) { }
    let last_week_messages_string = last_week_messages.map((message: Message) => { return `\n${message.is_outbound ? 'Journal:' : 'Human:'} ${message.content}` }).join('')

    // TODO add token max catch

    last_week_messages_string.split('').length * 3 / 4 > 2048 ? last_week_messages_string = last_week_messages_string.slice(0, 2048 * 3 / 4) : last_week_messages_string
    const openAIResponse = await openai.createCompletion({
      model: 'gpt-4', temperature: 0.9, presence_penalty: 1.0, frequency_penalty: 1.0, max_tokens: 512,
      prompt: `${fs.readFileSync('prompts/summarize.txt', 'utf8')}\nEntries: ${last_week_messages_string}\nResponse:`
    })
    const response = openAIResponse.data.choices[0].text
    await send_message({ ...default_message, content: response, number: user.number, response_time: current_hour })
  })
})
// weekly_summary.start()

// ======================================================================================
// ========================================FUNCTIONS=====================================
// ======================================================================================

async function analyze_message(message: Prisma.MessageCreateInput, assigned_category?: Type) {
  try {
    const t0 = Date.now()
    const default_response: Prisma.MessageCreateInput = { ...default_message, number: message.number }
    if (!message.content || !message.number) { return }
    if (message.content.toLowerCase() === 'reset') { log_message({ ...message, type: Type.reset }); return }
    let user = await prisma.user.findFirst({ where: { number: message.number } })
    if (!user) { error_alert(`user not found: ${message.number}`); return }
    let temp = 0.9, pres = 1.0, freq = 1.0, model: Model = Model.chat
    if (user.model) model = user.model; if (user.temp) temp = user.temp; if (user.pres) pres = user.pres; if (user.freq) freq = user.freq

    const previous_messages = await get_previous_messages(message, 8, false)
    console.log(`${log_time(message.response_time)} - user`)

    // checking for Reaction messages
    const reactions_array = Object.values(Reactions)
    if (reactions_array.some(reaction => message.content?.startsWith(reaction))) {
      const reaction_and_message = message.content.split('“', 2)
      let reacted_message = await prisma.message.findFirst({ where: { number: message.number, content_letters: { startsWith: content_letters(reaction_and_message[1].slice(0, -3)) } } })
      if (reacted_message) {
        reacted_message.reactions.push(reaction_and_message[0].split(' ')[0] as Reactions);
        await prisma.message.update({ where: { id: reacted_message.id }, data: { reactions: reacted_message.reactions } })
      }
      console.log(`reactions: ${Date.now() - t0}ms`)
      return
    }

    // admin messages
    if (message.content.toLowerCase().startsWith('admin:') && admin_numbers.includes(message.number)) {
      console.log(`${log_time(message.response_time)} - admin`)
      await send_message({ ...default_message, content: message.content.split(':').pop()!, media_url: message.media_url, type: Type.question }, users); return
    } else if (message.content.toLowerCase().startsWith('question:') && admin_numbers.includes(user.number)) {
      console.log('QUESTION ADDED')
      const start_date = chrono.parse(message.content.split(': ', 2).pop()!.split('@')[1])[0].start.date()
      admin_question.push({ question: message.content.split(': ', 2).pop()!.split('@')[0], time: start_date })
      console.log('admin question ' + JSON.stringify(admin_question))
      return
    } else if (message.content.toLowerCase().startsWith('image')) {
      create_image(message); return
    }
    console.log(admin_question)

    // ========================CATEGORIZE========================================================================

    let category: string
    if (!assigned_category) {
      // const categories: string[] = Object.values(Type)
      const categories = ['discuss', 'help', 'customer_support', 'quote', 'update_profile']
      const category_response = await openai.createCompletion({
        model: 'text-davinci-003', temperature: 0.3,
        prompt: `You are part of an AI journaling chatbot. To determine which function to run next, categorize the users intent into one of the following: ${categories}. "help" is only if the user has questions about the service. "customer_support" is ONLY for people asking specifically about how the service works. Unless clear otherwise, the category should be "discuss". Examples:
      Text: I need help planning my day
      Category: discuss
      Text: what's my bio
      Category: update_profile
      Text: change my hometown to Ann Arbor
      Category: update_profile
      Text: how does this app work
      Category: customer_support
      Text: gimme a quote
      Category: quote
      Some of your previous conversation is included below for context
      ###
      ${previous_messages}
      ###
      Text: ${message.content}
      Category:`
      })
      category = category_response.data.choices[0].text!.toLowerCase().replace(/\s/g, '')
      console.log(`${log_time(message.response_time)} - category == ${category}`)
      if (!category || !categories.includes(category!)) {
        error_alert(` ! miscategorization (${message.number}): '${message.content}'\ncategory: ${category}`)
        await send_message({ ...default_message, content: `Sorry bugged out, try again`, number: message.number, })
        return
      }

      await log_message(message)    // wait til after admin commands
    } else {
      category = assigned_category
    }
    console.log(category)

    // ========================FUNCTIONS==========================================================================
    if (category == Type.discuss || category == Type.follow_up) {
      let init_prompt = fs.readFileSync('prompts/init_prompt.txt', 'utf8')

      // get messages user reacted to with love or emphasize
      const reacted_messages = await prisma.message.findMany({ where: { number: message.number, reactions: { hasSome: [Reactions.Loved, Reactions.Emphasized] } }, orderBy: { date: "desc" }, take: 5 })

      // get messages preceding reacted messages
      const reacted_messages_prompts = await Promise.all(reacted_messages.map(async (message: Message) => {
        try {
          return await prisma.message.findFirstOrThrow({ where: { number: message.number, id: message.id - 1 } })
        } catch (e) { return message }
      }))
      // combine prompts and messages
      let reacted_messages_with_prompts = reacted_messages_prompts.flatMap((value, index) => [value, reacted_messages[index]])


      /* // TODO: make it into following format so it distinguishes them as separate message/prompt pairs
      [message 1] fjfjfjfj
      [response 1] fhjfjhadfsj
       */
      const reacted_messages_formatted: ChatCompletionRequestMessage[] = reacted_messages_with_prompts.map((message: Message) => { return { role: 'system', name: message.is_outbound ? 'example_assistant' : 'example_user', content: `[${message.date!.toLocaleString("en-US", message_date_format)}] ${message.content}` } })

      let previous_messages_array: ChatCompletionRequestMessage[] = previous_messages.map((message: Message) => { return { role: message.is_outbound ? "assistant" : "user", content: `[${message.date?.toLocaleString("en-US", message_date_format)}] ${message.content}` } })

      /* if (category == Type.follow_up) {
        previous_messages_array.push({ role: 'user', content: `[${new Date().toLocaleString("en-US", message_date_format)}] [no response. help the user take action.]` })
      } */

      let prompt: ChatCompletionRequestMessage[] = [{ role: 'system', content: init_prompt }]
      prompt = prompt.concat(reacted_messages_formatted, previous_messages_array, [{ role: 'user', content: `[${message.date?.toLocaleString("en-US", message_date_format)}] ${message.content}` }])

      const completion = await openai.createChatCompletion({ max_tokens: 256, model: 'gpt-4', temperature: temp, presence_penalty: pres, frequency_penalty: freq, messages: prompt, })
      let completion_string = completion.data.choices[0].message!.content

      if (completion_string.includes('M]')) completion_string = completion_string.split('M] ', 2).pop()!  // remove date from completion

      await send_message({ ...default_response, content: completion_string, tokens: message.tokens })
    } else if (category == Type.update_profile) {
      let openAIResponse = await openai.createCompletion({
        model: 'text-davinci-003', temperature: 0.3, presence_penalty: 2.0, frequency_penalty: 2.0, max_tokens: 256,
        prompt: `${fs.readFileSync('prompts/update_profile_prompt.txt', 'utf8')}
        current bio:${user.bio}
        current principles:${user.principles}
        Message: ${message.content}
        updated bio:`
      })

      const response = openAIResponse.data.choices[0].text!.split(':')
      await send_message({ ...default_response, content: `${response[0].toLowerCase().replace(/\s/g, '') == 'view' ? 'your bio:' : 'updated bio:'}\n${response[1]}` })
      await prisma.user.update({ where: { number: message.number! }, data: { bio: response[1] } })
    } else if (category == Type.help) {
      let openAIResponse = await openai.createCompletion({
        model: 'text-davinci-003', temperature: 0.9, presence_penalty: 1.0, frequency_penalty: 1.0, max_tokens: 256,
        prompt: `${fs.readFileSync('prompts/help.txt', 'utf8')}
        Text: ${message.content}
        Response:`
      })
      const response = openAIResponse.data.choices[0].text
      await send_message({ ...default_response, content: response ? response : 'Sorry bugged out. Try again' })
    } else if (category == Type.quote) {
      await send_message({ ...default_response, content: get_quote() })
    } else if (category == Type.customer_support) {
      send_message({ ...default_response, content: `Sorry for the inconvenience, somebody from the team will reach out.` })
      send_message({ ...default_response, content: ` ! Customer support request from (${user.number})\n${message.content}` }, admins)
    } else if (category == Type.advice) {

    } else if (category == Type.follow_up) {

    }
    console.log(`${log_time(message.response_time)} - analyze_message`)
  } catch (e) { error_alert(` ! analyze_message (${message.number}): ${e}`) }
}

const message_date_format: object = { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true }

async function get_previous_messages<T extends boolean>(message: Prisma.MessageCreateInput, amount: number, chat: T): Promise<T extends true ? ChatCompletionRequestMessage[] : Message[]> {
  // TODO not ideal cuz parses EVERY message from that number lol
  const resetMessage = await prisma.message.findFirst({ where: { number: message.number, content: 'reset' }, orderBy: { id: 'desc' } })
  let resetMessageLoc
  resetMessage === null ? resetMessageLoc = 0 : resetMessageLoc = resetMessage.id
  let previous_messages = await prisma.message.findMany({ where: { number: message.number, id: { gt: resetMessageLoc } }, orderBy: { id: 'desc' }, take: amount })
  previous_messages = previous_messages.reverse()

  const previous_messages_chat: ChatCompletionRequestMessage[] = previous_messages.map((message: Message) => { return { role: message.is_outbound ? "assistant" : "user", content: `[${message.date?.toLocaleString("en-US", message_date_format)}] ${message.content}` } })
  return previous_messages_chat as any
}

async function send_message(message: Prisma.MessageCreateInput, users?: User[], testing: boolean = false) {
  try {
    message.date = new Date(), message.is_outbound = true
    if (message.response_time) message.response_time = Number(message.date.valueOf() - message.response_time) / 1000
    console.log(message.response_time)
    console.log(users)
    if (users) {
      for (const user of users) {
        sendblue.sendMessage({ content: message.content ? message.content : undefined, number: user.number, send_style: message.send_style ? message.send_style : undefined, media_url: message.media_url ? message.media_url : undefined, status_callback: sendblue_callback })
        if (!testing) log_message({ ...message, number: user.number })
        console.log(`message sent to ${user.number}`)
      }
    } else {
      sendblue.sendMessage({ content: message.content ? message.content : undefined, number: message.number, send_style: message.send_style ? message.send_style : undefined, media_url: message.media_url ? message.media_url : undefined, status_callback: sendblue_callback })
      if (!testing) log_message(message)
    }
    console.log(`${Date.now() - message.date.valueOf()}ms - send_message`)

  } catch (e) { error_alert(e) }
}

async function create_image(message: Prisma.MessageCreateInput) {
  const t0 = Date.now()
  if (!message.content) { return }
  // TODO replace with AI routing
  // https://help.openai.com/en/articles/6582391-how-can-i-improve-my-prompts-with-dall-e
  // additive prompting (using GPT to create prompts) [https://twitter.com/nickfloats/status/1635116672054079488?s=20]
  // GPT-4 prompts for Midjourney (https://www.youtube.com/watch?v=Asg1e_IYzR8)
  let content_lc = message.content.toLowerCase(), image_prompt, image: string
  content_lc.startsWith('image of') ? image_prompt = (content_lc.split('image of ')[1]) : image_prompt = (content_lc.split('image ')[1])

  // TODO implement different styles
  if (!image_prompt.includes('style')) { image_prompt += ', photorealistic, detailed' }

  const response = await openai.createImage({ prompt: image_prompt, n: 1, size: '1024x1024' })
  image = response.data.data[0].url!
  // TODO add collage capabilities https://cloudinary.com/documentation/image_collage_generation

  let public_id = `${message.number!.substring(1)}_${message.date?.valueOf()}`
  try {
    let data: any = await cloudinary.uploader.upload(image, { public_id: public_id, folder: '/robome', })

    await send_message({ ...default_message, number: message.number, media_url: `https://res.cloudinary.com/dpxdjc7qy/image/upload/q_80/v${data.version}/${data.public_id}.${data.format}` })

    console.log(`${Date.now() - t0}ms - create_image`)
  } catch (error) { error_alert(error) }
}

// ======================================================================================
// =====================================ADMIN STUFF======================================
// ======================================================================================

async function error_alert(error: any, message?: Message) {
  await send_message({ ...default_message, content: `ERROR: ${error}`, number: '+13104974985' })
  console.error(`ERROR: ${error}`)
  if (message) await send_message({ ...default_message, content: `Sorry bugged out, try again.`, number: message.number })
}

const log_time = (time: number) => `${((new Date().valueOf() - time) / 1000).toFixed(1)}sec`

// ======================================================================================
// ========================================TESTING=======================================
// ======================================================================================

const test_message: Prisma.MessageCreateInput = { ...default_message, number: '+13104974985', content: 'question: What difficult thing are you going to do today? @10am' }
const test_message_users: Prisma.MessageCreateInput = { ...default_message, content: 'question: What difficult thing are you going to do today? @10am' }
test(test_message)
async function test(message?: Prisma.MessageCreateInput) {
  try {
    // console.log('admin question ' + JSON.stringify(admin_question))
    // const chrono_output = chrono.parse('11:30pm')
    // console.log(chrono_output[0].start.date())
    await local_data()
    // await send_message(test_message, users)
    console.log(users)
    users.forEach(async user => {
      const lastMessage = await prisma.message.findFirst({
        where: { number: user.number, date: { gte: new Date(Date.now() - 60*60*1000) } },
        orderBy: { date: 'desc' }
      });
  
      if (!lastMessage) await analyze_message({ ...default_message, content: `[no response. help the user take action.]`, number: user.number }, Type.follow_up)
    })

    console.log('test')
  } catch (e) { /* error_alert(e) */ }
}

/* async function update_table(){
  const table = await prisma.table.findMany()
  console.log(table)
  table.forEach(async (row) => {
    const hour = row.date.getHours()
    await prisma.table.update({ where: { id: row.id }, data: new_row })
  })
} */