require('dotenv').config()
import { Message, User, Prisma, PrismaClient, SendStyle, Reactions, Type } from '@prisma/client'
import { Client, ClientConfig } from 'pg'
import Sendblue from 'sendblue'
import express from 'express'
import morgan from 'morgan'
import bodyParser from 'body-parser'
import { Configuration, OpenAIApi, ChatCompletionRequestMessage } from 'openai'
import cron from 'cron'
import os from 'os'
import fs from 'fs'
import { Decimal } from '@prisma/client/runtime'
import * as chrono from 'chrono-node'
import timezone from 'moment-timezone'

const app = express(), sendblue = new Sendblue(process.env.SENDBLUE_API_KEY!, process.env.SENDBLUE_API_SECRET!), configuration = new Configuration({ organization: process.env.OPENAI_ORGANIZATION, apiKey: process.env.OPENAI_API_KEY, })
const openai = new OpenAIApi(configuration)

let hostname = '0.0.0.0', link = 'https://jrnl.onrender.com'; const PORT = Number(process.env.PORT)
if (os.hostname().split('.').pop() === 'local') hostname = '127.0.0.1', link = process.env.NGROK!
app.listen(PORT, hostname, () => { console.log(`server at http://${hostname}:${PORT}/`) })
app.use(express.static('public')); app.use(express.urlencoded({ extended: true }))
app.use(bodyParser.json()); app.use(morgan('dev')); app.use('/assets', express.static('assets'));

// ========================================================================================
// ========================================DATABASE========================================
// ========================================================================================
let clientConfig: ClientConfig  // need to pass ssl: true for external access
process.env.PGHOST!.includes('render') ? clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT), ssl: true } : clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT) }
const client = new Client(clientConfig), prisma = new PrismaClient(); client.connect()

const default_message: Message = {
  content: null, number: '', type: null, is_outbound: null, date: new Date(), was_downgraded: null, media_url: null, send_style: null, response_time: null, content_letters: null, tokens: null,
  human: null,
  id: 0,
  reactions: [],
  keywords: [], relevance: null,
  group_id: null,
  model: null,
  hour: null,
}

const default_user: User = {
  number: '', bio: '', timezone: null,
  model: null, freq: null, pres: null, temp: null
}
async function log_message(message: Message) {
  if (message.content) message.content_letters = content_letters(message.content)
  id++; message.id = id
  await prisma.message.create({ data: message })
}

const content_letters = (content: string) => content.slice(0, 30).replace(/[^a-z]/gi, "")
enum AdminNumbers { Watts = '+13104974985', Pulice = '+12015190240' }
const signup_link = 'https://tally.so/r/w4Q7kX', admin_numbers: string[] = Object.values(AdminNumbers)

// ======================================================================================
// ========================================ROUTES========================================
// ======================================================================================

app.post('/signup-form', async (req: express.Request, res: express.Response) => {
  try {
    const t0 = Date.now()
    let fields = req.body.data.fields, user: User = { ...default_user, number: fields[0].value, timezone: fields[1].options.find((option: any) => option.id === fields[1].value).text, }
    res.status(200).end()

    if (!users.includes(user.number)) {
      await send_message({ ...default_message, content: greeting_message.content, number: user.number, media_url: greeting_message.media_url, send_style: greeting_message.send_style, response_time: t0 })
      await prisma.user.create({ data: user })
      await sendblue.sendGroupMessage({ content: `NEW USER`, numbers: admin_numbers })
      users.push(user.number)
    }

  } catch (e) { res.status(500).end(); error_alert(e) }
})

app.post('/message', (req: express.Request, res: express.Response) => {
  try {
    const message: Message = { ...default_message, content: req.body.content, media_url: req.body.media_url, number: req.body.number, was_downgraded: req.body.was_downgraded, is_outbound: false, date: req.body.date_sent, group_id: Number(req.body.group_id), response_time: Number(new Date().valueOf()) }
    res.status(200).end()
    analyze_message(message)
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

/* async function timezone_correction(timezone: string) {
  timezones = ['PST', 'MST', 'CST', 'EST']
  return t0 + timezones.indexOf(timezone)
} */

const job = new cron.CronJob('55 */1 * * *', async () => {
  const t0 = new Date().getHours(), times = [9, 13, 17, 21], timezones = ['PST', 'MST', 'CST', 'EST']
  console.log(`t0: ${t0}`)
  const users_with_timezone = await prisma.user.findMany({ where: { timezone: { not: null } } })
  users_with_timezone.forEach(async user => {
    if (times.includes(t0 + timezones.indexOf(user.timezone!))) {
      await send_message({ ...default_message, content: quotes[Math.floor(Math.random() * quotes.length)], number: user.number, response_time: t0 })
    }
  })
})
job.start()

let users: string[], id: number
local_data()
async function local_data() {
  try {
    users = await prisma.user.findMany().then(users => users.map(user => user.number))
    id = await prisma.message.findFirst({ orderBy: { id: 'desc' } }).then(message => message!.id)
  } catch (e) { console.log(e) }
}

// ======================================================================================
// ========================================FUNCTIONS=====================================
// ======================================================================================
const temp_default = 0.9, pres_default = 1.0, freq_defualt = 1.0, model_default = 'chat'
const adjust_message = `adjust weights like this:\n'w:<temp>,<pres>,<freq>'\nex: 'w:0.9,1.0,1.0'\nreset with 'w:reset'\nchange between ChatGPT and (text) Davinci with 'm:chat' or 'm:text'`
let temp: number | null = temp_default, pres: number | null = pres_default, freq: number | null = freq_defualt, model = model_default

async function analyze_message(message: Message) {
  try {
    const t0 = Date.now()
    const response_message: Message = { ...default_message, number: message.number }
    if (!message.content || !message.number) { return }
    if (message.content.toLowerCase() === 'reset') {
      message.type = 'reset'
      log_message({ ...message, type: Type.reset }); return
    }

    let user = await prisma.user.findFirst({ where: { number: message.number } })
    if (!user) { error_alert(`user not found: ${message.number}`); return }
    user.freq = freq_defualt; user.pres = pres_default; user.temp = temp_default; user.model = model_default
    console.log(`get_user: ${Date.now() - t0}ms`)

    // checking for Reaction messages
    const reactions_array = ['Liked', 'Disliked', 'Emphasized', 'Laughed at', 'Loved']    // checking for reactions
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

    if (message.content.toLowerCase().includes('admin\n...') && admin_numbers.includes(message.number)) {
      await send_message({ ...default_message, content: message.content.split('...\n').pop()!, type: Type.question }, users); return
    } // ADJUST WEIGHTS
    else if (message.content.startsWith('w:') && admin_numbers.includes(message.number)) {
      let values = message.content.split('w:')[1], weights = values.split(',').map(str => Number(str))
      if (values == 'reset') temp = null, pres = null, freq = null
      else temp = weights[0], pres = weights[1], freq = weights[2]

      await sendblue.sendMessage({ content: `weights updated from (temp,pres,freq) = (${user.temp},${user.pres},${user.freq}) to (${temp},${pres},${freq})`, number: message.number, status_callback: sendblue_callback }) // don't log the message
      await prisma.user.update({ where: { number: message.number }, data: { temp, pres, freq } })
      return
    } // ADJUST MODEL
    else if (message.content.startsWith('m:') && admin_numbers.includes(message.number)) {
      let model = message.content.split('m:')[1]
      if (model == 'chat' || model == 'text' || model == 'rapid') {
        await prisma.user.update({ where: { number: message.number }, data: { model } })
        await sendblue.sendMessage({ content: `${model} activated\nweights (temp,pres,freq) = ${user.temp}, ${user.pres}, ${user.freq}\ndefault weights = ${temp}, ${pres}, ${freq}`, number: message.number, status_callback: sendblue_callback })
        return
      }
      await sendblue.sendMessage({ content: `think your formatting's wrong, try 'm:chat', 'm:text', 'm:rapid'`, number: message.number, status_callback: sendblue_callback })
      return
    }

    await log_message(message)    // wait til after admin commands

    const categories: string[] = Object.values(Type)

    const previous_messages = await get_previous_messages(message, 8, false)
    const category_response = await openai.createCompletion({
      model: 'text-davinci-003', temperature: 0.3,
      prompt: `You are part of an AI journaling chatbot. To determine which function to run next, categorize the users intent into one of the following: ${categories}. Customer support is ONLY for people asking specifically about how the service works. Examples:
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
    const category = category_response.data.choices[0].text!.toLowerCase().replace(/\s/g, '')
    console.log(category)
    if (!category || !categories.includes(category!)) {
      error_alert(` ! miscategorization (${message.number}): '${message.content}'\ncategory: ${category}`)
      await send_message({ ...default_message, content: `Sorry bugged out, try again`, number: message.number, })
      return
    }

    if (category == Type.discuss) {
      const previous_messages_string = previous_messages.map((message: Message) => { return `\n[${message.date?.toLocaleString('en-US', message_date_format)}] ${message.is_outbound ? 'Journal:' : 'Human: '} ${message.content}` }).join('')

      let openAIResponse = await openai.createCompletion({
        max_tokens: 512, model: 'text-davinci-003', temperature: temp, presence_penalty: pres, frequency_penalty: freq,
        prompt: `${fs.readFileSync('prompts/init_prompt.txt', 'utf8')}\n${user!.bio}\n###\n${previous_messages_string}\n[${new Date().toLocaleString('en-US', message_date_format)}] Journal:`
      })

      // console.log(prompt + openAIResponse.data.choices[0].text)
      if (!openAIResponse.data.choices[0].text) { error_alert('OpenAI Response was empty'); return }
      send_message({ ...default_message, content: openAIResponse.data.choices[0].text, number: message.number, tokens: message.tokens, response_time: message.response_time })

    } else if (category == Type.update_profile) {
      const user = await prisma.user.findFirst({ where: { number: message.number } })
      let openAIResponse = await openai.createCompletion({
        model: 'text-davinci-003', max_tokens: 512, temperature: 0.3, presence_penalty: 2.0, frequency_penalty: 2.0,
        prompt: `${fs.readFileSync('prompts/update_profile_prompt.txt', 'utf8')}\nBio:\n${user ? user.bio : ''}\nMessage: ${message.content}\nResponse:`
      })

      const response = openAIResponse.data.choices[0].text!.split(':')
      await send_message({ ...default_message, content: `${response[0].toLowerCase().replace(/\s/g, '') == 'view' ? 'your bio:' : 'updated bio:'}\n${response[1]}`, number: message.number, })
      await prisma.user.update({ where: { number: message.number! }, data: { bio: response[1] } })

    } else if (category == Type.help) {
      let openAIResponse = await openai.createCompletion({
        model: 'text-davinci-003', max_tokens: 256, temperature: 0.9, presence_penalty: 1.0, frequency_penalty: 1.0,
        prompt: `${fs.readFileSync('prompts/help.txt', 'utf8')}\nText: ${message.content}\nResponse:`
      })
      const response = openAIResponse.data.choices[0].text
      await send_message({ ...default_message, content: response ? response : 'Sorry bugged out. Try again', number: message.number! })
    } else if (category == Type.quote) {
      await send_message({ ...default_message, content: quotes[Math.floor(Math.random() * quotes.length)], number: user.number, response_time: t0 })
    }
    console.log(`${Date.now() - t0}ms - analyze_message`)
  } catch (e) { error_alert(` ! analyze_message (${message.number}): ${e}`) }
}

const message_date_format: object = { weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: true }

async function get_previous_messages(message: Message, amount: number = 14, chat: boolean) {
  const resetMessage = await prisma.message.findFirst({ where: { number: message.number, content: 'reset' }, orderBy: { id: 'desc' } })  // TODO not ideal cuz parses EVERY message from that number lol
  let resetMessageLoc
  resetMessage === null ? resetMessageLoc = 0 : resetMessageLoc = resetMessage.id
  let previous_messages = await prisma.message.findMany({ where: { number: message.number, id: { gt: resetMessageLoc } }, orderBy: { id: 'desc' }, take: amount })
  return previous_messages.reverse()
}

async function send_message(message: Message, numbers?: string[]) {
  try {
    const t0 = Date.now()
    message.date = new Date(), message.is_outbound = true
    if (message.response_time) message.response_time = Number(t0.valueOf() - message.response_time)
    console.log(message.response_time)
    if (numbers) {
      for (const number of numbers) {
        await sendblue.sendMessage({ content: message.content ? message.content : undefined, number: number, send_style: message.send_style ? message.send_style : undefined, media_url: message.media_url ? message.media_url : undefined, status_callback: sendblue_callback })
      }
      log_message(message)
    }
    await sendblue.sendMessage({ content: message.content ? message.content : undefined, number: message.number, send_style: message.send_style ? message.send_style : undefined, media_url: message.media_url ? message.media_url : undefined, status_callback: sendblue_callback })

    log_message(message)
    console.log(`${Date.now() - t0}ms - send_message`)
  } catch (e) { error_alert(e) }
}

// ======================================================================================
// =====================================ADMIN STUFF======================================
// ======================================================================================

async function error_alert(error: any, message?: Message) {
  // await send_message({ content: `ERROR: ${error}`, number: admin_numbers.toString() })
  console.error(`ERROR: ${error}`)
  if (message) send_message({ ...default_message, content: `Sorry bugged out, try again.`, number: message.number })
}

const greeting_message: Message = { ...default_message, content: `Hi I'm jrnl, your conversational AI journal. We're trying to  Reply to my questions or text me when you want. I messsage every 3 hours throughout the day, Feel free to react to messages to better train me. Everything operates on natural language, so no need to learn any fancy commands. Your 'bio' provides me insight, helping me help you. Ask to view it or change it anytime. Remember, no special commands just speak as you would Add the contact card and pin me in your messages for quick access.`, media_url: `${link}/assets/jrnl.vcf`, send_style: SendStyle.lasers }

// ======================================================================================
// ========================================TESTING=======================================
// ======================================================================================

// test()
async function test() {

}

// test2()
async function test2() {
  const chrono_output = chrono.parse('5pm to 7pm')

  console.log(chrono_output[0])
}

/* async function update_table(){
  const table = await prisma.table.findMany()
  console.log(table)
  table.forEach(async (row) => {
    const hour = row.date.getHours()
    await prisma.table.update({ where: { id: row.id }, data: new_row })
  })
} */

const quotes = [`“We suffer more often in imagination than in reality” - Seneca`, `“One sign that determination matters more than talent: there are lots of talented people who never achieve anything, but not that many determined people who don't.” - Paul Graham`, `“We don’t take pictures, when you’re rich you just see it again.” - Childish Gambino`, `“Don’t think, just do” - Maverick, Top Gun 2: The Second Toppening`, `“Life is always a tightrope or a feather bed. Give me the tightrope.” - Edith Wharton`, `“Life isn’t about finding yourself. Life is about creating yourself.” - George Bernard Shaw`, `"Excessive sorrow laughs. Excessive joy weeps." - William Blake`, `"All that you touch you Change. All that you Change Changes you. The only lasting truth Is Change." - Octavia E. Butler`, `“Always remember that to argue, and win, is to break down the reality of the person you are arguing against. It is painful to lose your reality, so be kind, even if you are right.” - Haruki Murakami`, `"Knowledge is knowing that a tomato is a fruit. Wisdom is knowing not to put it in a fruit salad." - Brian O'Driscoll`, `"In spite of the cost of living, it's still popular." - Kathleen Norris`, `"People are frugal in guarding their personal property; but as soon as it comes to squandering time they are most wasteful of the one thing in which it is right to be stingy" - Seneca`, `"First say to yourself what you would be; and then do what you have to do." - Epictetus`, `"The point is to get your work done, and your work is to change the world." - James Baldwin`, `"And we should consider every day lost on which we have not danced at least once. And we should call every truth false which was not accompanied by at least one laugh." - Friedrich Nietzsche`, `“Leadership is about making others better as a result of your presence and making sure that impact lasts in your absence.” - Sheryl Sandberg`, `"I must die. Must I then die lamenting? I must be put in chains. Must I then also lament? I must go into exile. Does any man then hinder me from going with smiles and cheerfulness and contentment?" - Epictetus`, `“To choose doubt as a philosophy of life is akin to choosing immobility as a means of transportation.” - Yann Martel`, `"Hide nothing, for time, which sees all and hears all, exposes all.” - Sophocles`, `“Never let the future disturb you. You will meet it, if you have to, with the same weapons of reason which today arm you against the present.” - Marcus Aurelius`, `“You overestimate what you can do in a year and underestimate what you can do in 10 years.” - Bill Gates`, `a non-zero chance of death is required to pendent zero chance of life (personal)`, `"I try to keep in mind that if I dropped dead tomorrow, all of my acrylic workplace awards would be in the trash the next day and my job would be posted in the paper before my obituary." - Bernie Klinder`, `"We are at the mercy of whoever wields authority over the things we either desire or detest. If you would be free, then, do not wish to have, or avoid, things that other people control, because then you must serve as their slave." - Epictetus`, `"love is knowing something deeply" - Ann Druyan`, `"My 1 repeated learning in life: 'There Are No Adults' Everyone's making it up as they go along. Figure it out yourself, and do it." - @naval`, `"I would unite with anybody to do right and with nobody to do wrong" - Frederick Douglass`, `“If you’re efficient, you’re doing it the wrong way. The right way is the hard way. The show was successful because I micromanaged it—every word, every line, every take, every edit, every casting. That’s my way of life.” - Jerry Seinfeld`, `"To the most trivial actions, attach the devotion and mindfulness of a hundred monks. To matters of life and death, attach a sense of humor." - Chinese philosopher Zhuangzi`, `“What is more important? The human value of the dollar, or the value dollar of the human?” - Jonas Salk (discoverer of the polio vaccine)`, `"A good rule of thumb is to talk to yourself the way you might talk to a friend. Since we know so much about ourselves, we tend to be our own worst critics, but if we talk to ourselves the way we'd help a friend, we can see the situation for what it really is."`, `"How we spend our days is, of course, how we spend our lives. What we do with this hour, and that one, is what we are doing. A schedule defends from chaos and whim. It is a net for catching days. It is a scaffolding on which a worker can stand and labor with both hands at sections of time. A schedule is a mock-up of reason and order—willed, faked, and so brought into being; it is a peace and a haven set into the wreck of time; it is a lifeboat on which you find yourself, decades later, still living. Each day is the same, so you remember the series afterward as a blurred and powerful pattern." - Annie Dillard`, `“When nothing seems to help, I go and look at a stonecutter hammering away at his rock, perhaps a hundred times without as much as a crack showing in it. Yet at the hundred and first blow it will split in two, and I know it was not that last blow that did it—but all that had gone before.” - Jacob Riis`, `“I now have a very simple metric I use: are you working on something that can change the world? Yes or no? The answer for 99.99999 percent of people is ‘no.’ I think we need to be training people on how to change the world. Obviously, technologies are the way to do that. That’s what we’ve seen in the past; that’s what driven all the change.” - Larry Page`, `The only thing that interferes with my learning is my education - Albert Einstein`, `What people do now on the weekends is what people 10 years from now will be doing during the week - Chris Dixon (not exact quote)`, `Your direction is more important than your speed`, `Diversify domains to decrease commitment`, `"Our dinners weren’t talking all about Apple tariffs and technology. I’d say 75% was talking about life. To be a good CEO, to get things accomplished, you have to be personable, you have to be a good communicator and a good listener, and Tim was all of those things." - The Fortress that Tim Cook Built`, `"Books for mindset.\nQuiet time to think for strategy.\nConversations with successful peers for tactics." - James Clear`, `“A leader must be inspired by the people before a leader can inspire the people” - Simon Sinek`, `"No one on his deathbed ever said, "I wish I had spent more time on my business" - Paul Tsongas`, `"Lessons are repeated until they are learned. A lesson will be presented to you in various forms until you have learned it. When you have learned it, you can go on to the next lesson. Learning lessons does not end. There's no part of life that doesn't contain its lessons. If you're alive, that means there are still lessons to be learned." - Cherie Carter-Scott in If Life is a Game, These are the Rules`, `"Love is not determined by the one being loved but rather by the one choosing to love" - Stephen Kendrick`, `“Man cannot do without beauty, and this is what our era pretends to want to disregard.” - Albert Camus`, `"Habits are like financial capital – forming one today is an investment that will automatically give out returns for years to come." - Shawn Achor`, `"Just like children, emotions heal when they are heard and validated." - Jill Boyle Taylor`, `“A man who has a vision is not able to use the power of it until after he has performed the vision on earth for the people to see.” - Black Elk`, `"That art thou" - Buddhist saying`, `"We are in the habit of imagining our lives to be linear, a long march from birth to death in which we mass our powers, only to surrender them again, all the while slowly losing our youthful beauty. This is a brutal untruth. Life meanders like a path through the woods. We have seasons when we flourish and seasons when the leaves fall from us, revealing our bare bones. Given time, they grow again." - Katherine May`, `“Like our stomachs, our minds are hurt more often by overeating than by hunger.” (Ut stomachis sic ingeniis nausea sepius nocuit quam fames.) - Petrarch`, `“Let me never fall into the vulgar mistake of dreaming that I am persecuted whenever I am contradicted.” - Ralph Waldo Emerson`, `“People do not decide their futures, they decide their habits and their habits decide their futures.” - F. Matthias Alexander`, `“We must believe that we are gifted for something, and that this thing, at whatever cost, must be attained.” - Marie Curie`, `"You're never too old to set another goal or to dream a new dream" - CS Lewis`, `"We generate fears when we sit. We overcome then with action." -`, `“The best way to predict the future is to create it” - Peter Drucker`, `"Freedom is the only worthy goal in life. It is won by disregarding things that lie beyond our control" — Epictetus`, `“I don't trust people who don’t love themselves and tell me ‘I love you.’ … There is an African saying which is: ‘Be careful when a naked person offers you a shirt.’” - Maya Angelou`, `“If you absolutely can’t tolerate critics, then don’t do anything new or interesting.” - Jeff Bezos`, `“Trust yourself. Create the kind of self you will be happy to live with all your life.” - Golda Meir`, `“If we have our own why in life, we shall get along with almost any how” - Friedrich Nietzsche`, `“Success is dangerous. One begins to copy oneself and to copy oneself is more dangerous than to copy others.” - Pablo Picasso`, `"Learning is the only thing the mind never exhausted, never fears, and never regrets." - Leonardo da Vinci`, `“If you do tomorrow what you did today, you will get tomorrow what you got today.” - Benjamin Franklin`, `"May your choices reflect your hopes, not your fears" - Nelson Mandela`, `“These individuals have riches just as we say that we “have a fever,” when really the fever has us” - Seneca`, `“Ordinarily he was insane, but he had lucid moments when he was merely stupid” - Heinrich Heine`, `“An expert is a person who has made all the mistakes that can be made in a very narrow field” - Niels Bohr`, `“Anyone who lives within their means suffers from a lack of imagination” - Oscar Wilde`, `“Learn the rules like a pro, so you can break them like an artist” - Pablo Picasso`, `“Eat a live frog first thing in the morning, and nothing worse will happen to you the rest of the day” - Mark Twain`, `“If you’re going through hell, keep going” - Churchill`, `“Happy families are all alike; every unhappy families is unhappy in its own way.” - Leo Tolstoy`, `“What is important is seldom urgent, and what is urgent is seldom important.” - Dwight Eisenhower`, `“When you are tired of saying it, people are starting to hear it.” - Jeff Weiner, CEO of LinkedIn`, `“Give me six hours to chop down a tree and I will spend the first four sharpening the axe.” -Abraham Lincoln`, `“Don’t tell people how to do things, tell them what you need done and let them surprise you with their results.” - Patton`, `“It takes more than one human brain to create a human mind” - Lisa Feldman Barrett`, `“A person’s success in life can usually be measured by the number of uncomfortable conversations he or she is willing to have” - Tim Ferriss`, `“We cannot change that we are not aware of, and once we are aware, we cannot help but change” - Sheryl Sandberg`, `“Get over “blame” and “credit” and get on with “accurate” and “inaccurate”” - Ray Dalio principle`, `“Regret for the things we did can be tempered by time; it is regret for the things we did not do that is inconsolable” - Sydney Harris`, `“Real failure is trying something, learning it doesn’t work, then continuing to do it anyway” - Astro Teller, Captain at Moonshot X`, `“It is not death that a man should fear, but he should fear never beginning to live” - Marcus Aurelius`, `“The greatest enemy of learning is knowing” - John Maxwell`, `“The best is the enemy of the good” - Voltaire`, `“Making the best of things is a damn poor way of dealing with them. My life has been a series of escapes from that quicksand” - Rose Wilder Lane`, `“Conversation is to be thought of as creating a social world just as causality generates a physical one” - Rom Harré`, `“Life can only be understood backward, but it must be lived forward” - Søren Kierkegaard`, `“Inaction breeds fear and doubt. Action breeds confidence and courage. If you want to conquer fear, do not sit home and think about it. Go out and get busy” - Dale Carnegie`, `“Knowledge is not skill. Knowledge plus 10,000 times is skill” - Shinichi Suzuki`, `“Be ruled by time, the wisest counselor of all” - Plutarch`, `“To achieve great things, two things are needed: a plan, and not quite enough time” - Leonard Bernstein`, `“Action may not always bring happiness, but there is no happiness without action.” - Benjamin Disraeli`, `“Set aside a certain number of days, during which you shall be content with the scantiest and cheapest fare, with coarse and rough dress, saying to yourself the whole: ‘Is this the condition I feared?’” - Seneca`, `“I am an old man and have known a great many troubles, but most of them never happened.” - Mark Twain`, `"Life should not be a journey to the grave with the intention of arriving safely in a pretty and well preserved body, but rather to skid in broadside in a cloud of smoke, thoroughly used up, totally worn out, and loudly proclaiming: 'Wow! What a Ride!'" - Hunter S. Thompson`, `“Do every act of life as if it was the last act of your life” - Marcus Aurelius`, `“When you find peace within yourself, you become the kind of person who can love at peace with others.” - Peace Pilgrim`, `“Perfectionism leads to procrastination, which leads to paralysis.” - Whitney Cummings`, `“People pleasing is a form of assholery”`, `“The difference between people you admire and everybody else is that the former are the people who read” - Bryan Callen to David Blaine, inspiring Blaine to read extensively`, `“The world is changed by your example, not by your opinion” - Paulo Coelho`, `“Honor those who seek truth, beware of those who’ve found it” - Voltaire`, `“Whenever you find yourself on the side of the majority, it’s time to pause and reflect” - Mark Twain`, `“The limits of my language mean the limits of my world” - Ludwig Wittgenstein`, `“Robustness is when you care more about the few who like your work than the multitude who hates it; fragility is when you care more about the few who hate your work than the multitude who loves it” - Nassim Taleb`, `“Cynicism is a disease that robs people of the gift of life” - Rainn Wilson`, `“The most important trick to be happy is to realize that happiness is a choice that you make and a skill that you develop. You choose to be happy, and then you work at it. It’s just like building muscles” - Naval Ravikant`, `“Enlightenment is the space between your thoughts” - Eckhart Tolle`, `“Question with boldness even the existence of a God; because, if there be one, he must more approve of the homage of reason, than that of blindfolded fear.” - Thomas Jefferson`, `“If you’re studying my game, you’re entering my game, and I’ll be better at it than you” - Marcelo Garcia`, `“The hero and the coward feel the same thing, but the hero uses his fear, projects it onto his opponent, while the coward runs. It’s the same thing – fear – but it’s what you do with it that matters.” - Cus D’Amato, Mike Tyson’s first coach, telling his athletes before big fights`, `“A person’s success in life can usually be measured by the number of uncomfortable conversations he or she is willing to have” - Tim Ferriss`, `“The credit belongs to the man who is actually in the arena, whose face is marred by dust and sweat and blood,; who strives valiantly, who errs, who comes short again and again, because there is no effort without error and shortcoming…” - Theodore Roosevelt`, `“We are simultaneously gods and worms.” - Abraham Maslow`, `“Process saves us from the poverty of our intentions”`, `“Be the needle in the haystack of history”`, `“Mind fire-colliding neurons-consciousness”`, `"Humanity represents an accumulation of collective ideas"`, `"Every cell in the universe is autonomously supported by the rest of the universe"`, `"Instead of dwelling in the past, create the future"`, `"When shit happens, don’t swim in it"`, `"Chance will stop you in your tracks because change has no beginning and no end"`, `"There is no difference between creation and evolution. Things are created to evolve, equally."`, `"The universe is made of 0s and 1s - from 0 nothingness to 1 consciousness"`, `"We all benefit from the ingenuity of the collective human mind"`, `"The ideas of the living feed on the ideas of the dead."`, `"We arrive naive. We depart with some understanding"`, `"History is an interpretation of facts, but these facts remain uncertain and obscured"`, `"How can anything that’s said be true when it’s interpreted differently by everyone else?"`, `"No matter what happens, it will still be different"`, `"The unknown is the source of all knowledge"`, `"You can readily organize your chaos because order underlies chaos"`]