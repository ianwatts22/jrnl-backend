"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require('dotenv').config();
const client_1 = require("@prisma/client");
const pg_1 = require("pg");
const sendblue_1 = __importDefault(require("sendblue"));
const express_1 = __importDefault(require("express"));
const morgan_1 = __importDefault(require("morgan"));
const body_parser_1 = __importDefault(require("body-parser"));
const openai_1 = require("openai");
const cron_1 = __importDefault(require("cron"));
const os_1 = __importDefault(require("os"));
const chrono = __importStar(require("chrono-node"));
const pinecone_1 = require("@pinecone-database/pinecone");
const pinecone = new pinecone_1.PineconeClient();
pinecone.init({
    environment: "YOUR_ENVIRONMENT",
    apiKey: "YOUR_API_KEY",
});
const app = (0, express_1.default)();
const sendblue = new sendblue_1.default(process.env.SENDBLUE_API_KEY, process.env.SENDBLUE_API_SECRET);
const sendblue_test = new sendblue_1.default(process.env.SENDBLUE_TEST_API_KEY, process.env.SENDBLUE_TEST_API_SECRET);
const signup_link = 'https://tally.so/r/w4Q7kX';
const subscribe_link = 'https://ianwatts.site/robome.html'; //SUBCRIPTION PAYMENT
const subscription_link = 'https://billing.stripe.com/p/login/9AQ14y0S910meZO6oo';
const admin_numbers = ['+13104974985', '+12015190240']; // Watts, Pulice
// OpenAI config
const configuration = new openai_1.Configuration({ organization: process.env.OPENAI_ORGANIZATION, apiKey: process.env.OPENAI_API_KEY, });
const openai = new openai_1.OpenAIApi(configuration);
// START Connects system to internet DON'T TOUCH
let hostname;
os_1.default.hostname().split('.').pop() === 'local' ? hostname = '127.0.0.1' : hostname = '0.0.0.0';
const PORT = Number(process.env.PORT);
app.listen(PORT, hostname, () => { console.log(`server at     http://${hostname}:${PORT}/`); });
// middleware & static files, comes with express
app.use(express_1.default.static('public'));
app.use(express_1.default.urlencoded({ extended: true }));
app.use(body_parser_1.default.json());
app.use((0, morgan_1.default)('dev'));
// End Connects system to internet DON'T TOUCH
// ========================================================================================
// ========================================DATABASE========================================
// ========================================================================================
// PostgreSQL db
let clientConfig; // need to pass ssl: true for external access
process.env.PGHOST.includes('render') ? clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT), ssl: true } : clientConfig = { user: process.env.PGUSER, host: process.env.PGHOST, database: process.env.PGDATABASE, password: process.env.PGPASSWORD, port: Number(process.env.PGPORT) };
const client = new pg_1.Client(clientConfig);
const prisma = new client_1.PrismaClient();
client.connect();
function log_user(user) {
    return __awaiter(this, void 0, void 0, function* () { yield prisma.users.create({ data: user }); });
}
function log_message(message) {
    return __awaiter(this, void 0, void 0, function* () {
        const t0 = Date.now();
        // TODO: replace with tokenizer? (find in Readme)
        if (message.tokens && message.content) {
            message.tokens = Math.round(message.content.split(' ').length * 4 / 3);
        }
        // await prisma.messages.create({ data: message }) // ! wtf is wrong here?
        console.log(`${Date.now() - t0}ms - log_message`);
    });
}
// ======================================================================================
// ========================================ROUTES========================================
// ======================================================================================
app.post('/signup-form', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const t0 = Date.now();
        console.log(JSON.stringify(req.body));
        let fields = req.body.data.fields;
        res.status(200).end();
        let user = { name: fields[0].value, number: fields[1].value, timezone: fields[2].value.options.find((option) => option.id === fields[2].value).text }; // Tally webhooks data formatting is a nightmare
        let existing_user = yield get_user(user.number);
        if (!existing_user) {
            send_message({ content: `Welcome to jrnl, your conversational journal buddy. Consistent journaling is hard, so we're lowering the barrier. Text us when you want,  Add the contact card and pin me for max utility.`, media_url: `https://ianwatts.site/assets/Robome.vcf`, number: user.number });
        }
        log_user(user);
        send_message({ content: `NEW USER: ${user.name} ${user.number}`, number: admin_numbers.join() });
        const t1 = Date.now();
        console.log(`${t1 - t0}ms - /signup-form: ${user.name} ${user.number}`);
    }
    catch (e) {
        error_alert(e);
        res.status(500).end();
    }
}));
app.post('/message', (req, res) => {
    try {
        const t0 = Date.now();
        const message = { content: req.body.content, media_url: req.body.media_url, number: req.body.number, was_downgraded: req.body.was_downgraded, is_outbound: false, date: req.body.date_sent, group_id: req.body.group_id };
        res.status(200).end();
        analyze_message(message, req.body.accountEmail);
        const t1 = Date.now();
        console.log(`${t1 - t0}ms - /message: (${message.number}${message.content}`);
    }
    catch (e) {
        console.log(e);
        send_message({ content: `ERROR: ${e} ${req.body.error_message}`, number: admin_numbers.toString() });
        res.status(500).end();
    }
});
// ======================================================================================
// ========================================TESTING=======================================
// ======================================================================================
// CRON
// RUNS EVERY 5 MINUTES
const job = new cron_1.default.CronJob('0 */1 * * *', () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('CRON:');
}));
job.start();
function test() {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield openai.createEmbedding({
            model: "text-embedding-ada-002",
            input: "The food was delicious and the waiter...",
        });
    });
}
test_chrono();
function test_chrono() {
    return __awaiter(this, void 0, void 0, function* () {
        const parsed_date = chrono.parseDate('july');
        console.log(parsed_date);
    });
}
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
  }
  
  // Date: 2/23/23
  // Prompt: how many times did I mention Jeff in the January
  
  const query = prisma.messages.findMany({
    where: where,
  })
  const where = `;
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
// ======================================================================================
// ========================================FUNCTIONS========================================
// ======================================================================================
function send_message(message, test) {
    return __awaiter(this, void 0, void 0, function* () {
        message.date = new Date();
        message.is_outbound = true;
        let response;
        // if (message.group_id)
        if (test) {
            response = yield sendblue_test.sendMessage({ content: message.content, number: message.number, send_style: message.send_style, media_url: message.media_url });
        }
        else {
            response = yield sendblue.sendMessage({ content: message.content, number: message.number, send_style: message.send_style, media_url: message.media_url }); // TODO add status_callback
        }
        log_message(message);
        console.log(``);
    });
}
// ==========================ANALYZE MESSAGE=========================
function analyze_message(message, accountEmail) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!message.content || !message.number) {
            return;
        }
        yield log_message(message);
        let test = false;
        if (accountEmail == 'alecwatts1@gmail.com') {
            test = true;
        }
        const content_lc = message.content.toLowerCase();
        // feedback, help (FAQ->directions->support), image, logging, 
        if (content_lc.includes('admin message\n----') && admin_numbers.includes(message.number)) {
            send_message({ content: message.content.split('----').pop(), number: message.number }, test);
        }
        else {
            format_text(message, test);
        }
    });
}
function get_context(message) {
    return __awaiter(this, void 0, void 0, function* () {
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
        return 'need to fix last10Messages';
    });
}
const get_user = (number) => __awaiter(void 0, void 0, void 0, function* () { return yield prisma.users.findFirst({ where: { number: number }, }); });
function format_text(message, test) {
    return __awaiter(this, void 0, void 0, function* () {
        let init_prompt = `CONTEXT (DO NOT MENTION)\ntoday: ${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}You are a chatbot used for conversational journaling. You act as a digital mirror of the journaler, helping them explore their emotions and ideas out of their head and into the real world. You are kind, empathetic, and supportive, but are not a pushover and are willing to ask hard questions.
LIMITATIONS:
You have no internet access, and may get specific facts wrong
GUIDELINES:
Ask people to expand on things if
No obvious, general information. Be specific.
Speak casually (contractions, slang, emojis ok).
Avoid repeating information.
Do not provide or mention links to the internet.`;
        let context = yield get_context(message);
        let prompt = `${init_prompt} ${context} \nJournal:`;
        console.log(prompt);
        respond_text(message, prompt, test);
    });
}
// ==========================================
function respond_text(message, prompt, test) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const t0 = Date.now();
            let openAIResponse = yield openai.createCompletion({
                model: 'text-davinci-003',
                prompt: prompt,
                max_tokens: 400,
                temperature: 0.9,
                presence_penalty: 1.0,
                frequency_penalty: 1.0, // between -2 to 2
                // suffix: '', https://beta.openai.com/docs/api-reference/completions/create#completions/create-suffix
                // user: '', https://beta.openai.com/docs/api-reference/completions/create#completions/create-user
            });
            if (!openAIResponse.data.usage) {
                return;
            }
            // let prompt_tokens = openAIResponse.data.usage.prompt_tokens
            // let completion_tokens = openAIResponse.data.usage.completion_tokens
            message.tokens = openAIResponse.data.usage.total_tokens;
            yield send_message({ content: openAIResponse.data.choices[0].text, number: message.number, tokens: message.tokens }, test);
            const t1 = Date.now();
            console.log(`${t1 - t0}ms - respond_text`);
        }
        catch (err) {
            console.log(` ! respond_text error: ${err}`);
        }
    });
}
let send_style_options = new Set(["celebration", "shooting_star", "fireworks", "lasers", "love", "confetti", "balloons", "spotlight", "echo", "invisible", "gentle", "loud", "slam"]);
// ====================================ADMIN STUFF==================================
function error_alert(error) {
    return __awaiter(this, void 0, void 0, function* () {
        yield send_message({ content: `ERROR: ${error}`, number: admin_numbers.toString() });
        console.error(`ERROR: ${error}`);
    });
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
